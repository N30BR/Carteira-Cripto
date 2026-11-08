import type { Db } from "@/db/client";
import { cached } from "@/lib/prices/cache";
import { fetchCandles, fetchChartSymbols, fetchOpenInterest, type Candle, type ChartSymbol } from "@/lib/prices/binance";
import { fetchBybitOpenInterest, BYBIT_OI_PERIOD } from "@/lib/prices/bybit";
import { AGGREGATED, aggregateCandles, type CandleQuery } from "./params";

const DAY = 86_400_000;

// Lista em memória (evita ler e decodificar a lista inteira do banco a cada vela pedida).
// Se a Binance falhar e não houver lista guardada, espera 5 min antes de tentar de novo.
const LISTING_MEMO_MS = 10 * 60_000;
const LISTING_RETRY_MS = 5 * 60_000;
let listing: { at: number; list: ChartSymbol[]; set: Set<string> } | null = null;
let listingFailedAt = -Infinity;

export function resetListingCache(): void {
  listing = null;
  listingFailedAt = -Infinity;
}

/** Pares cotados em USDT, BTC e ETH; a lista fica guardada por um dia. */
export async function listChartSymbols(db: Db, now = new Date()): Promise<ChartSymbol[]> {
  const t = now.getTime();
  if (listing && t - listing.at < LISTING_MEMO_MS) return listing.list;
  if (!listing && t - listingFailedAt < LISTING_RETRY_MS) return [];
  const r = await cached(db, "chart:symbols:v1", DAY, fetchChartSymbols, now);
  if (!r?.data.length) {
    listingFailedAt = t;
    return listing?.list ?? [];
  }
  listing = { at: t, list: r.data, set: new Set(r.data.map((s) => s.symbol)) };
  return r.data;
}

/**
 * O par está na lista da Binance? Sem lista disponível (Binance fora, banco recém-restaurado),
 * aceita qualquer par com formato válido cotado em USDT/BTC/ETH: a própria Binance recusa o que não existir.
 */
export async function isListedSymbol(db: Db, symbol: string, now = new Date()): Promise<boolean> {
  await listChartSymbols(db, now);
  if (listing) return listing.set.has(symbol);
  return /^[A-Z0-9]{2,20}$/.test(symbol) && /^[A-Z0-9]{2,}(USDT|BTC|ETH)$/.test(symbol);
}

// Velas em memória (não no banco: rolar o gráfico para trás criaria entradas sem fim).
// Recentes: alguns segundos a poucos minutos, conforme o tempo do gráfico; antigas (com data final): 1 dia.
const MAX_ENTRIES = 400;
const TTL: Record<string, number> = {
  "1m": 15_000,
  "5m": 30_000,
  "15m": 60_000,
  "30m": 60_000,
  "1h": 120_000,
  "4h": 120_000,
  "6h": 120_000,
  "12h": 300_000,
  "1d": 300_000,
  "3d": 600_000,
  "1w": 600_000,
  "1M": 600_000,
};
const store = new Map<string, { at: number; data: Candle[] }>();
const inFlight = new Map<string, Promise<Candle[]>>();

export function resetCandleCache(): void {
  store.clear();
  inFlight.clear();
}

export async function getCandles(query: CandleQuery, nowMs = Date.now()): Promise<Candle[]> {
  // 2D, 6M e 1A não existem na Binance: junta as diárias/mensais (que já passam pelo cache abaixo).
  const agg = AGGREGATED[query.interval];
  if (agg) {
    const want = Math.min(1000, (query.limit + 1) * agg.count);
    const base = await getCandles({ ...query, interval: agg.base, limit: want }, nowMs);
    // Veio a quantidade pedida: o histórico foi cortado e o 1º grupo pode estar incompleto.
    return aggregateCandles(base, query.interval as "2d" | "6M" | "1y", { dropPartialFirst: base.length >= want }).slice(-query.limit);
  }
  // Data final no futuro = "mais recentes" (senão ficaria 1 dia em cache como se fosse passado).
  const q = query.end !== null && query.end >= nowMs ? { ...query, end: null } : query;
  const key = `${q.symbol}:${q.interval}:${q.limit}:${q.end ?? "now"}`;
  const ttl = q.end === null ? TTL[q.interval] : DAY;
  const hit = store.get(key);
  if (hit && nowMs - hit.at < ttl) return hit.data;
  const running = inFlight.get(key);
  if (running) return running;
  const job = fetchCandles(q.symbol, q.interval, q.limit, q.end)
    .then((data) => {
      store.delete(key);
      store.set(key, { at: nowMs, data });
      // Remove as mais antigas quando passa do limite (o Map mantém a ordem de inserção).
      while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value as string);
      return data;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

// ---------- open interest (Binance Futures) ----------
const OI_PERIOD: Record<string, string> = {
  "1m": "5m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "4h": "4h",
  "6h": "6h",
  "12h": "12h",
  "1d": "1d",
  "2d": "1d",
  "3d": "1d",
  "1w": "1d",
  "1M": "1d",
  "6M": "1d",
  "1y": "1d",
};
const OI_TTL = 5 * 60_000;
const OI_FAIL_TTL = 60_000;
const oiStore = new Map<string, { at: number; data: [number, number][] }>();
const oiFailed = new Map<string, { at: number; error: unknown }>();

export function resetOpenInterestCache(): void {
  oiStore.clear();
  oiFailed.clear();
}

/** Open interest do perpétuo no período do gráfico (5 min em cache; poucos pares × poucos períodos). */
export async function getOpenInterest(symbol: string, interval: string, nowMs = Date.now()): Promise<[number, number][]> {
  const period = OI_PERIOD[interval];
  const key = `${symbol}:${period}`;
  const hit = oiStore.get(key);
  if (hit && nowMs - hit.at < OI_TTL) return hit.data;
  // Falha recente: responde o mesmo erro por 1 min, sem repetir o pedido à Futures.
  const failed = oiFailed.get(key);
  if (failed && nowMs - failed.at < OI_FAIL_TTL) throw failed.error;
  let data: [number, number][];
  try {
    data = await fetchOpenInterest(symbol, period);
  } catch (e) {
    oiFailed.set(key, { at: nowMs, error: e });
    while (oiFailed.size > 200) oiFailed.delete(oiFailed.keys().next().value as string);
    throw e;
  }
  oiFailed.delete(key);
  oiStore.set(key, { at: nowMs, data });
  while (oiStore.size > 200) oiStore.delete(oiStore.keys().next().value as string);
  return data;
}

// ---------- open interest histórico (mapa de liquidações) ----------
// Bybit (desde 2020, público) para o histórico; sem ela (fora do ar, bloqueio regional, par que ela não tem), o open
// interest da Binance Futures, que só cobre ~30 dias. Em cache por 5 min por par/período, cobrindo a data pedida.
const PERIOD_MS: Record<string, number> = { "5min": 300_000, "15min": 900_000, "30min": 1_800_000, "1h": 3_600_000, "4h": 14_400_000, "1d": DAY };
const MAX_POINTS = 6000;
type HistOi = { source: "bybit" | "binance"; points: [number, number][] };
const histStore = new Map<string, { at: number; from: number; data: HistOi }>();
const histFailed = new Map<string, number>();
const histInFlight = new Map<string, { from: number; job: Promise<HistOi> }>();

export function resetHistoricalOpenInterestCache(): void {
  histStore.clear();
  histFailed.clear();
  histInFlight.clear();
}

export async function getHistoricalOpenInterest(symbol: string, interval: string, fromMs: number, nowMs = Date.now()): Promise<HistOi> {
  const period = BYBIT_OI_PERIOD[interval];
  if (!period) throw new Error("Tempo inválido");
  // No máximo ~6000 pontos (30 páginas): 1h ≈ 250 dias, 1d ≈ 16 anos.
  const from = Math.max(fromMs, nowMs - MAX_POINTS * PERIOD_MS[period]);
  const key = `${symbol}:${period}`;
  const hit = histStore.get(key);
  if (hit && nowMs - hit.at < OI_TTL && hit.from <= from + PERIOD_MS[period]) return hit.data;
  // Pedido igual em andamento: reaproveita só se ele cobre a data pedida (senão um pedido curto, feito ao trocar de
  // tempo, responderia no lugar do histórico longo).
  const running = histInFlight.get(key);
  if (running && running.from <= from + PERIOD_MS[period]) return running.job;
  const job = (async (): Promise<HistOi> => {
    const failedAt = histFailed.get(key);
    if (failedAt === undefined || nowMs - failedAt >= OI_FAIL_TTL) {
      try {
        const points = await fetchBybitOpenInterest(symbol, period, from, nowMs);
        if (points.length) {
          histFailed.delete(key);
          const data: HistOi = { source: "bybit", points };
          histStore.set(key, { at: nowMs, from, data });
          while (histStore.size > 100) histStore.delete(histStore.keys().next().value as string);
          return data;
        }
      } catch {
        // segue para a Binance
      }
      histFailed.set(key, nowMs);
      while (histFailed.size > 200) histFailed.delete(histFailed.keys().next().value as string);
    }
    return { source: "binance", points: await getOpenInterest(symbol, interval, nowMs) };
  })().finally(() => {
    if (histInFlight.get(key)?.job === job) histInFlight.delete(key);
  });
  histInFlight.set(key, { from, job });
  return job;
}
