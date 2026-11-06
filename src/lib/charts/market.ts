import type { Db } from "@/db/client";
import { cached } from "@/lib/prices/cache";
import { fetchCandles, fetchChartSymbols, fetchOpenInterest, type Candle, type ChartSymbol } from "@/lib/prices/binance";
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
  // 6M e 1A não existem na Binance: junta as mensais (que já passam pelo cache abaixo).
  const months = AGGREGATED[query.interval];
  if (months) {
    const monthly = await getCandles({ ...query, interval: "1M", limit: Math.min(1000, (query.limit + 1) * months) }, nowMs);
    return aggregateCandles(monthly, query.interval as "6M" | "1y").slice(-query.limit);
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
