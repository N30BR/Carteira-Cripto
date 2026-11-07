// Valor DIVULGADO dos eventos dos EUA já ocorridos, pelo ALFRED (arquivo de versões do FRED, mesma chave do Macro).
//
// Como funciona: para um evento do dia D, pede a série "como estava publicada no dia D" (realtime_start = realtime_end
// = D). Só aceita o número se a observação mais recente dessa versão foi publicada exatamente em D — ou seja, é o
// dado que saiu naquele dia (não um valor revisado depois, nem o do mês anterior). Variações (m/m, y/y) são
// calculadas com os valores da mesma versão, como o órgão oficial divulga. Sem chave, sem série correspondente ou
// sem publicação no dia: fica "—" (nunca um valor estimado).
import type { Db } from "@/db/client";
import { readCache, writeCache } from "@/lib/prices/cache";
import type { NewsEvent } from "./calendar";

type Kind = "pct" | "yoy" | "diff" | "level";
type Spec = { series: string; kind: Kind; scale?: number; unit: "%" | "K" | "M" | "B" | ""; decimals: number };

/** Título do evento (Forex Factory) → série do FRED e como o número é apresentado. */
export const RELEASES: Record<string, Spec> = {
  "Non-Farm Employment Change": { series: "PAYEMS", kind: "diff", unit: "K", decimals: 0 },
  "Unemployment Rate": { series: "UNRATE", kind: "level", unit: "%", decimals: 1 },
  "Average Hourly Earnings m/m": { series: "CES0500000003", kind: "pct", unit: "%", decimals: 1 },
  "Unemployment Claims": { series: "ICSA", kind: "level", scale: 1 / 1000, unit: "K", decimals: 0 },
  "JOLTS Job Openings": { series: "JTSJOL", kind: "level", scale: 1 / 1000, unit: "M", decimals: 2 },
  "CPI m/m": { series: "CPIAUCSL", kind: "pct", unit: "%", decimals: 1 },
  "Core CPI m/m": { series: "CPILFESL", kind: "pct", unit: "%", decimals: 1 },
  "CPI y/y": { series: "CPIAUCNS", kind: "yoy", unit: "%", decimals: 1 },
  "PPI m/m": { series: "PPIFIS", kind: "pct", unit: "%", decimals: 1 },
  "Retail Sales m/m": { series: "RSAFS", kind: "pct", unit: "%", decimals: 1 },
  "Core Retail Sales m/m": { series: "RSFSXMV", kind: "pct", unit: "%", decimals: 1 },
  "Core PCE Price Index m/m": { series: "PCEPILFE", kind: "pct", unit: "%", decimals: 1 },
  "Advance GDP q/q": { series: "A191RL1Q225SBEA", kind: "level", unit: "%", decimals: 1 },
  "Prelim GDP q/q": { series: "A191RL1Q225SBEA", kind: "level", unit: "%", decimals: 1 },
  "Final GDP q/q": { series: "A191RL1Q225SBEA", kind: "level", unit: "%", decimals: 1 },
  "Industrial Production m/m": { series: "INDPRO", kind: "pct", unit: "%", decimals: 1 },
  "Construction Spending m/m": { series: "TTLCONS", kind: "pct", unit: "%", decimals: 1 },
  "Factory Orders m/m": { series: "AMTMNO", kind: "pct", unit: "%", decimals: 1 },
  "Durable Goods Orders m/m": { series: "DGORDER", kind: "pct", unit: "%", decimals: 1 },
  "Trade Balance": { series: "BOPGSTB", kind: "level", scale: 1 / 1000, unit: "B", decimals: 1 },
  "Consumer Credit m/m": { series: "TOTALSL", kind: "diff", unit: "B", decimals: 1 },
  "Prelim Nonfarm Productivity q/q": { series: "PRS85006092", kind: "level", unit: "%", decimals: 1 },
  "Prelim Unit Labor Costs q/q": { series: "PRS85006112", kind: "level", unit: "%", decimals: 1 },
  "Housing Starts": { series: "HOUST", kind: "level", scale: 1 / 1000, unit: "M", decimals: 2 },
  "Building Permits": { series: "PERMIT", kind: "level", scale: 1 / 1000, unit: "M", decimals: 2 },
  "New Home Sales": { series: "HSN1F", kind: "level", unit: "K", decimals: 0 },
  "Prelim UoM Consumer Sentiment": { series: "UMCSENT", kind: "level", unit: "", decimals: 1 },
};

export type Obs = { date: string; value: string; realtime_start: string };

/** Data do evento no fuso de Nova York (as datas de publicação do FRED são as do calendário americano). */
export const nyDate = (ts: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(ts);

/**
 * Número divulgado no dia `day` a partir das observações da versão daquele dia (mais recentes primeiro).
 * null se a observação mais recente não foi publicada exatamente nesse dia, ou se faltar dado para o cálculo.
 */
export function computeActual(obs: Obs[], spec: Spec, day: string): string | null {
  const valid = obs.filter((o) => o.value !== "." && Number.isFinite(Number(o.value))).sort((a, b) => b.date.localeCompare(a.date));
  const latest = valid[0];
  if (!latest || latest.realtime_start !== day) return null;
  const v = Number(latest.value);
  let x: number;
  if (spec.kind === "level") x = v;
  else if (spec.kind === "diff" || spec.kind === "pct") {
    const prev = valid[1];
    if (!prev) return null;
    const p = Number(prev.value);
    if (spec.kind === "diff") x = v - p;
    else {
      if (p === 0) return null;
      x = ((v - p) / p) * 100;
    }
  } else {
    // y/y: a mesma data um ano antes.
    const target = `${Number(latest.date.slice(0, 4)) - 1}${latest.date.slice(4)}`;
    const prev = valid.find((o) => o.date === target);
    if (!prev || Number(prev.value) === 0) return null;
    x = ((v - Number(prev.value)) / Number(prev.value)) * 100;
  }
  x *= spec.scale ?? 1;
  const fixed = x.toFixed(spec.decimals);
  // "-0.0" vira "0.0".
  const clean = Number(fixed) === 0 ? (0).toFixed(spec.decimals) : fixed;
  return `${clean}${spec.unit}`;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const fredKey = () => {
  const k = process.env.FRED_API_KEY;
  return k && /^[a-z0-9]{32}$/i.test(k) ? k : null;
};

type CachedActual = { value: string | null };

async function fetchVintage(series: string, day: string, key: string): Promise<Obs[]> {
  const url = `https://api.stlouisfed.org/fred/series/observations?${new URLSearchParams({
    series_id: series,
    api_key: key,
    file_type: "json",
    realtime_start: day,
    realtime_end: day,
    sort_order: "desc",
    limit: "14",
  })}`;
  // A mensagem de erro nunca leva a URL (que contém a chave).
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Error("FRED indisponível");
  }
  if (!res.ok) throw new Error(`FRED ${res.status}`);
  const body = (await res.json().catch(() => null)) as { observations?: unknown } | null;
  if (!Array.isArray(body?.observations)) throw new Error("FRED: resposta inesperada");
  return (body.observations as Record<string, unknown>[])
    .filter((o) => typeof o.date === "string" && typeof o.value === "string" && typeof o.realtime_start === "string")
    .map((o) => ({ date: o.date as string, value: o.value as string, realtime_start: o.realtime_start as string }));
}

/**
 * Preenche o "Divulgado" dos eventos dos EUA já ocorridos (até `max` consultas novas por vez; o resto na próxima).
 * Resultado encontrado fica guardado para sempre (não muda); "ainda não publicado" é tentado de novo depois.
 */
export async function fillActuals(db: Db, events: NewsEvent[], now = new Date(), max = 24): Promise<NewsEvent[]> {
  const key = fredKey();
  if (!key) return events;
  const t = now.getTime();
  let budget = max;
  const jobs: Promise<void>[] = [];
  const out = events.map((e) => ({ ...e }));
  const pending: { e: NewsEvent; spec: Spec; day: string; cacheKey: string }[] = [];
  for (const e of out) {
    const spec = RELEASES[e.title];
    if (e.region !== "US" || e.actual || !spec || e.ts > t) continue;
    const day = nyDate(e.ts);
    const cacheKey = `news:actual:${spec.series}:${spec.kind}:${day}:v1`;
    const hit = readCache<CachedActual>(db, cacheKey, now);
    if (hit && !hit.stale) {
      if (hit.data.value) e.actual = hit.data.value;
      continue;
    }
    pending.push({ e, spec, day, cacheKey });
  }
  // Poucas consultas ao mesmo tempo (respeita o limite do FRED).
  const queue = pending.slice(0, budget);
  budget -= queue.length;
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        const value = computeActual(await fetchVintage(job.spec.series, job.day, key), job.spec, job.day);
        // Achou: guarda para sempre. Não achou: tenta de novo em 2 h nos primeiros dias, depois em 7 dias.
        const recent = t - job.e.ts < 7 * DAY;
        writeCache(db, job.cacheKey, { value } satisfies CachedActual, value ? 3650 * DAY : recent ? 2 * HOUR : 7 * DAY, now);
        if (value) job.e.actual = value;
      } catch {
        // Fonte fora do ar: fica "—" agora e tenta na próxima abertura.
      }
    }
  };
  for (let i = 0; i < 3; i++) jobs.push(worker());
  await Promise.all(jobs);
  return out;
}
