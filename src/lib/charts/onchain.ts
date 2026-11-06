// Indicadores on-chain do Bitcoin (servidor). Só fontes gratuitas, sem chave:
// - BGeometrics / bitcoin-data.com, plano gratuito: 10 pedidos/hora e 15/dia por servidor; usamos até 8/hora e
//   12/dia, com o dia dividido em 5 janelas (cada série atualiza uma vez por dia, na sua janela). Em algumas
//   séries os últimos 7 dias chegam com atraso no plano gratuito.
// - Coin Metrics Community API: base do cálculo próprio (MVRV, valor de mercado, oferta, emissão, fluxos), com a
//   mesma cota diária.
// Preço realizado, NUPL, MVRV Z-Score e Puell: vêm da BGeometrics; sem cota (ou fora do ar), usa o cálculo próprio
// se a última conferência com a BGeometrics deu perto; senão, os últimos dados da BGeometrics guardados.
// SOPR, STH-SOPR, STH Realized Price, RHODL e Reserve Risk: só a BGeometrics (exigem dados por idade das moedas,
// que não existem de graça); sem cota, os últimos dados guardados. Netflow: Coin Metrics.
import type { Db } from "@/db/client";
import { readCache, writeCache } from "@/lib/prices/cache";
import type { Point } from "./macro-math";
import { bgSlot, budgetAllows, spendBudget, type Source } from "./onchain-budget";
import { BGEOMETRICS, BGEOMETRICS_CHECK, agreement, deriveCoinMetrics, parseBgeometrics, parseCoinMetrics, type Agreement } from "./onchain-math";
import type { OnchainId } from "./onchain-ids";

export { ONCHAIN_IDS, ONCHAIN_SERIES, type OnchainId } from "./onchain-ids";

const HOUR = 3_600_000;
const CM_TTL = 12 * HOUR;
/** Um pouco menos de 1 dia: no dia seguinte, a série já está vencida quando a janela dela volta. */
const BG_TTL = 20 * HOUR;
/** Depois de uma falha, espera antes de tentar de novo (não gasta a cota com repetições). */
const FAIL_COOLDOWN = HOUR;
const failedAt = new Map<string, number>();
const inFlight = new Map<string, Promise<unknown>>();

export class OnchainUnavailable extends Error {}

export type OnchainResult = {
  points: Point[];
  /** De onde veio: BGeometrics, cálculo próprio (Coin Metrics) ou Coin Metrics direto. */
  source: "bgeometrics" | "calculo" | "coinmetrics";
  /** Dados guardados de antes (a fonte não pôde ser consultada agora). */
  stale: boolean;
  note?: string;
};

const cmBase = () => process.env.COINMETRICS_BASE_URL ?? "https://community-api.coinmetrics.io";
const bgBase = () => process.env.BGEOMETRICS_BASE_URL ?? "https://bitcoin-data.com";

async function getJson(url: string, label: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000), headers: { Accept: "application/json" } });
  } catch {
    throw new Error(`${label} indisponível`);
  }
  if (!res.ok) throw new Error(`${label} ${res.status}`);
  return res.json();
}

/**
 * Cache no banco com cota: dado válido → devolve; vencido → busca só se houver cota (e janela) e se não estiver
 * em pausa por falha recente; senão devolve o guardado (marcado como antigo) ou null.
 */
async function gated<T>(db: Db, key: string, ttl: number, src: Source, slot: number | null, loader: () => Promise<T>, now: Date): Promise<{ data: T; stale: boolean } | null> {
  const hit = readCache<T>(db, key, now);
  if (hit && !hit.stale) return { data: hit.data, stale: false };
  const old = hit ? { data: hit.data, stale: true } : null;
  const last = failedAt.get(key);
  if (last !== undefined && now.getTime() - last < FAIL_COOLDOWN) return old;
  const running = inFlight.get(key) as Promise<{ data: T; stale: boolean } | null> | undefined;
  if (running) return running;
  if (!budgetAllows(db, slot, !!hit, now, src)) return old;
  const job = (async () => {
    spendBudget(db, now, src);
    try {
      const data = await loader();
      writeCache(db, key, data, ttl, now);
      failedAt.delete(key);
      return { data, stale: false };
    } catch {
      failedAt.set(key, now.getTime());
      return old;
    }
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

/** Métricas gratuitas da Coin Metrics para BTC, desde 2010 (uma página: ~6 mil dias), já com o cálculo próprio. */
function coinMetrics(db: Db, now: Date) {
  return gated(
    db,
    "onchain:coinmetrics:v1",
    CM_TTL,
    "coinmetrics",
    null,
    async () => {
      const q = new URLSearchParams({
        assets: "btc",
        metrics: "CapMVRVCur,CapMrktCurUSD,SplyCur,IssTotUSD,FlowInExNtv,FlowOutExNtv",
        frequency: "1d",
        start_time: "2010-07-18",
        page_size: "10000",
      });
      const rows = parseCoinMetrics(await getJson(`${cmBase()}/v4/timeseries/asset-metrics?${q}`, "Coin Metrics"));
      if (!rows.length) throw new Error("Coin Metrics: sem dados");
      return deriveCoinMetrics(rows);
    },
    now,
  );
}

function bgeometrics(db: Db, id: OnchainId, src: { path: string; field: string }, now: Date) {
  return gated(
    db,
    `onchain:bgeometrics:${src.path}:v1`,
    BG_TTL,
    "bgeometrics",
    bgSlot(id),
    async () => {
      const points = parseBgeometrics(await getJson(`${bgBase()}/v1/${src.path}`, "BGeometrics"), src.field);
      if (!points.length) throw new Error("BGeometrics: sem dados");
      return points;
    },
    now,
  );
}

const pct = (a: Agreement) => (a.diff === null ? "" : ` (diferença mediana ${a.diff < 1 ? (a.diff * 100).toFixed(1) + "%" : a.diff.toFixed(2)})`);

/** Série diária pronta para o gráfico ([ms, valor]); só dados reais das fontes. */
export async function getOnchainSeries(db: Db, id: OnchainId, now = new Date()): Promise<OnchainResult> {
  if (id === "EXCHANGE_NETFLOW") {
    const cm = await coinMetrics(db, now);
    if (!cm) throw new OnchainUnavailable("Coin Metrics indisponível no momento");
    return { points: cm.data.EXCHANGE_NETFLOW, source: "coinmetrics", stale: cm.stale };
  }

  const check = BGEOMETRICS_CHECK[id];
  if (check) {
    const calcId = id as "REALIZED_PRICE" | "NUPL" | "MVRV_Z" | "PUELL";
    const [bg, cm] = await Promise.all([bgeometrics(db, id, check, now), coinMetrics(db, now)]);
    const calc = cm?.data[calcId] ?? null;
    const agreeKey = `onchain:agreement:${id}:v1`;
    // Dado novo da BGeometrics: confere o cálculo próprio e guarda o resultado.
    if (bg && !bg.stale && calc) writeCache(db, agreeKey, agreement(id, calc, bg.data), 30 * 24 * HOUR, now);
    if (bg && !bg.stale) return { points: bg.data, source: "bgeometrics", stale: false };
    const agree = readCache<Agreement>(db, agreeKey, now)?.data;
    if (calc && agree?.ok) {
      return { points: calc, source: "calculo", stale: !!cm?.stale, note: `Cálculo próprio (Coin Metrics), conferido com a BGeometrics${pct(agree)}` };
    }
    if (bg) return { points: bg.data, source: "bgeometrics", stale: true, note: "BGeometrics: últimos dados guardados" };
    if (calc) {
      return {
        points: calc,
        source: "calculo",
        stale: !!cm?.stale,
        note: agree ? `Cálculo próprio (Coin Metrics); diferença grande na última conferência${pct(agree)}` : "Cálculo próprio (Coin Metrics), ainda não conferido com a BGeometrics",
      };
    }
    throw new OnchainUnavailable("BGeometrics e Coin Metrics indisponíveis no momento");
  }

  const src = BGEOMETRICS[id];
  if (!src) throw new OnchainUnavailable("Indicador desconhecido");
  const bg = await bgeometrics(db, id, src, now);
  if (!bg) throw new OnchainUnavailable("BGeometrics indisponível no momento (cota gratuita ou fonte fora do ar)");
  return { points: bg.data, source: "bgeometrics", stale: bg.stale, ...(bg.stale ? { note: "BGeometrics: últimos dados guardados" } : {}) };
}

export function resetOnchainFailures(): void {
  failedAt.clear();
  inFlight.clear();
}
