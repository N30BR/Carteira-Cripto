// Calendário econômico (servidor). Provedores trocáveis: hoje só a Forex Factory (gratuita, sem chave, semana atual).
// Os eventos ficam no banco e se acumulam semana a semana; se a fonte falhar, valem os últimos dados guardados.
// Alternativas pagas (não contratadas): Trading Economics, Financial Modeling Prep, Finnhub — exigem chave e plano.
import type { Db } from "@/db/client";
import { readCache, writeCache } from "@/lib/prices/cache";
import { fetchJsonCapped } from "@/lib/http";
import { mergeEvents, parseForexFactory, type NewsEvent, type RegionId } from "./calendar";

const MIN = 60_000;
/** Intervalo mínimo entre buscas na Forex Factory (o feed muda pouco; respeita a fonte). */
const REFRESH = 30 * MIN;
const FAIL_COOLDOWN = 15 * MIN;
const KEY = "news:events:v1";

type Stored = { events: NewsEvent[]; fetchedAt: number | null; coveredUntil: number | null; lastError: number | null };

export type NewsData = {
  events: NewsEvent[];
  /** Última busca que deu certo. */
  fetchedAt: number | null;
  /** Até quando a fonte já publicou eventos (fim da semana do feed). */
  coveredUntil: number | null;
  /** A última tentativa falhou: os dados podem estar desatualizados. */
  stale: boolean;
  /** Regiões sem fonte gratuita com classificação de impacto. */
  uncovered: RegionId[];
};

type Provider = { id: string; regions: RegionId[]; fetch: () => Promise<{ events: NewsEvent[]; window: { from: number; to: number } }> };

const ffUrl = () => process.env.FOREXFACTORY_URL ?? "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

const forexFactory: Provider = {
  id: "forexfactory",
  regions: ["US", "JP", "EU"],
  fetch: async () => {
    const events = parseForexFactory(await fetchJsonCapped(ffUrl(), 2_000_000, "Forex Factory", 15_000));
    if (!events.length) throw new Error("Forex Factory: semana sem eventos");
    // O feed é a semana (domingo a sábado, horário de Nova York): a janela vai do primeiro ao último evento ± 1 dia.
    const from = events[0].ts - 86_400_000;
    const to = events[events.length - 1].ts + 86_400_000;
    return { events, window: { from, to } };
  },
};

const PROVIDERS: Provider[] = [forexFactory];
const inFlight = new Map<Db, Promise<NewsData>>();

function read(db: Db): Stored {
  return readCache<Stored>(db, KEY)?.data ?? { events: [], fetchedAt: null, coveredUntil: null, lastError: null };
}

function view(s: Stored): NewsData {
  const covered = new Set(PROVIDERS.flatMap((p) => p.regions));
  return {
    events: s.events,
    fetchedAt: s.fetchedAt,
    coveredUntil: s.coveredUntil,
    stale: s.lastError !== null && (s.fetchedAt === null || s.lastError > s.fetchedAt),
    uncovered: (["US", "JP", "BR", "EU"] as RegionId[]).filter((r) => !covered.has(r)),
  };
}

/** Eventos guardados, atualizando da fonte se já passou o intervalo (uma busca por vez). `force` = botão "Atualizar". */
export async function getNewsData(db: Db, now = new Date(), force = false): Promise<NewsData> {
  const s = read(db);
  const t = now.getTime();
  const due = s.fetchedAt === null || t - s.fetchedAt >= (force ? 5 * MIN : REFRESH);
  const cooling = s.lastError !== null && t - s.lastError < FAIL_COOLDOWN && (s.fetchedAt === null || s.lastError > s.fetchedAt);
  if (!due || cooling) return view(s);
  const running = inFlight.get(db);
  if (running) return running;
  const job = (async () => {
    let next: Stored = s;
    for (const p of PROVIDERS) {
      try {
        const r = await p.fetch();
        next = {
          events: mergeEvents(next.events, r.events, r.window, t),
          fetchedAt: t,
          coveredUntil: Math.max(next.coveredUntil ?? 0, r.window.to),
          lastError: next.lastError,
        };
      } catch {
        next = { ...next, lastError: t };
      }
    }
    writeCache(db, KEY, next, 365 * 24 * 60 * MIN, now);
    return view(next);
  })().finally(() => inFlight.delete(db));
  inFlight.set(db, job);
  return job;
}
