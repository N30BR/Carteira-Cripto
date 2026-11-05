import type { Db } from "@/db/client";
import type { PricePoint } from "@/lib/portfolio/calc";
import { cached } from "./cache";
import { fetchPairKlines, fetchPairTickers } from "./binance";

// Cotações para a moeda de referência: R$ por 1 USDT e USDT por 1 BTC.
export const USDT_BRL = "USDTBRL";
export const BTC_USDT = "BTCUSDT";

const RATE_TTL = 60_000;
const HISTORY_TTL = 60 * 60_000;

export type Rates = { usdtBrl: number | null; btcUsdt: number | null };
/** Cotações atuais com a variação % de 24h de cada par (para saber a cotação de 24h atrás). */
export type CurrentRates = Rates & { usdtBrlChange24h: number | null; btcUsdtChange24h: number | null };
export type RateHistory = { usdtBrl: PricePoint[]; btcUsdt: PricePoint[] };

export async function getRates(db: Db, now = new Date()): Promise<CurrentRates & { fetchedAt: Date | null; stale: boolean }> {
  const r = await cached(db, "rates:now:v2", RATE_TTL, async (): Promise<CurrentRates> => {
    const t = await fetchPairTickers([BTC_USDT, USDT_BRL]);
    return {
      usdtBrl: t[USDT_BRL]?.usd ?? null,
      btcUsdt: t[BTC_USDT]?.usd ?? null,
      usdtBrlChange24h: t[USDT_BRL]?.change24h ?? null,
      btcUsdtChange24h: t[BTC_USDT]?.change24h ?? null,
    };
  }, now);
  if (!r) return { usdtBrl: null, btcUsdt: null, usdtBrlChange24h: null, btcUsdtChange24h: null, fetchedAt: null, stale: false };
  return { ...r.data, fetchedAt: r.fetchedAt, stale: r.stale };
}

export async function getRateHistory(
  db: Db,
  days: 30 | 365 | 1000,
  now = new Date(),
): Promise<RateHistory & { oldestFetchedAt: Date | null; stale: boolean }> {
  const [brl, btc] = await Promise.all(
    [USDT_BRL, BTC_USDT].map((pair) => cached(db, `ratechart:${pair}:${days}`, HISTORY_TTL, () => fetchPairKlines(pair, days), now)),
  );
  const dates = [brl, btc].filter((x) => x !== null).map((x) => x.fetchedAt);
  return {
    usdtBrl: brl?.data ?? [],
    btcUsdt: btc?.data ?? [],
    oldestFetchedAt: dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null,
    stale: !!(brl?.stale || btc?.stale),
  };
}
