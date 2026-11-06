import type { Db } from "@/db/client";
import { cached } from "@/lib/prices/cache";
import { fetchCandles, fetchChartSymbols, type Candle, type ChartSymbol } from "@/lib/prices/binance";
import type { CandleQuery } from "./params";

const DAY = 86_400_000;

/** Pares cotados em USDT, BTC e ETH; a lista fica guardada por um dia. */
export async function listChartSymbols(db: Db, now = new Date()): Promise<ChartSymbol[]> {
  const r = await cached(db, "chart:symbols:v1", DAY, fetchChartSymbols, now);
  return r?.data ?? [];
}

export async function isListedSymbol(db: Db, symbol: string, now = new Date()): Promise<boolean> {
  return (await listChartSymbols(db, now)).some((s) => s.symbol === symbol);
}

// Velas em memória (não no banco: rolar o gráfico para trás criaria entradas sem fim).
// Recentes: alguns segundos a poucos minutos, conforme o tempo do gráfico; antigas (com data final): 1 dia.
const MAX_ENTRIES = 400;
const TTL: Record<string, number> = { "1m": 15_000, "5m": 30_000, "15m": 60_000, "1h": 120_000, "4h": 120_000, "1d": 300_000, "1w": 600_000, "1M": 600_000 };
const store = new Map<string, { at: number; data: Candle[] }>();
const inFlight = new Map<string, Promise<Candle[]>>();

export function resetCandleCache(): void {
  store.clear();
  inFlight.clear();
}

export async function getCandles(q: CandleQuery, nowMs = Date.now()): Promise<Candle[]> {
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
