import type { Db } from "@/db/client";
import { PERIODS, type CurrentPrice, type Period, type PricePoint } from "@/lib/portfolio/calc";
import { normalizeSearch } from "@/lib/validation";
import { cached, pruneExpired, readCache, writeCache } from "./cache";
import { fetchMarketChart, fetchSearch, fetchSimplePrices, type CoinSearchResult } from "./coingecko";

export type { CoinSearchResult };

const PRICE_TTL = 60_000;
const HISTORY_TTL = 60 * 60_000;
const SEARCH_TTL = 24 * 60 * 60_000;

export async function getCurrentPrices(
  db: Db,
  ids: string[],
  now = new Date(),
): Promise<{ prices: Record<string, CurrentPrice>; fetchedAt: Date | null; stale: boolean }> {
  const unique = [...new Set(ids)].sort();
  // Cache por moeda: adicionar uma moeda nova não descarta o preço guardado das outras.
  const hits = new Map(unique.map((id) => [id, readCache<CurrentPrice>(db, `price:${id}`, now)]));
  const toFetch = unique.filter((id) => !hits.get(id) || hits.get(id)!.stale);

  if (toFetch.length) {
    try {
      const fresh = await fetchSimplePrices(toFetch);
      for (const [id, price] of Object.entries(fresh)) {
        writeCache(db, `price:${id}`, price, PRICE_TTL, now);
        hits.set(id, { data: price, fetchedAt: now, stale: false });
      }
    } catch {
      // Sem resposta: segue com o que houver no cache (marcado como antigo).
    }
  }

  const prices: Record<string, CurrentPrice> = {};
  let fetchedAt: Date | null = null;
  let stale = false;
  for (const [id, hit] of hits) {
    if (!hit) continue;
    prices[id] = hit.data;
    stale ||= hit.stale;
    if (!fetchedAt || hit.fetchedAt < fetchedAt) fetchedAt = hit.fetchedAt;
  }
  return { prices, fetchedAt, stale };
}

export async function getHistory(
  db: Db,
  ids: string[],
  period: Period,
  now = new Date(),
): Promise<{ history: Record<string, PricePoint[]>; oldestFetchedAt: Date | null; stale: boolean }> {
  const days = PERIODS[period].sourceDays;
  const results = await Promise.all(
    [...new Set(ids)].map(async (id) => [id, await cached(db, `chart:${id}:${days}`, HISTORY_TTL, () => fetchMarketChart(id, days), now)] as const),
  );
  const history: Record<string, PricePoint[]> = {};
  let oldest: Date | null = null;
  let stale = false;
  for (const [id, r] of results) {
    if (!r) continue;
    history[id] = r.data;
    stale ||= r.stale;
    if (!oldest || r.fetchedAt < oldest) oldest = r.fetchedAt;
  }
  return { history, oldestFetchedAt: oldest, stale };
}

export async function searchCoins(db: Db, query: string, now = new Date()): Promise<CoinSearchResult[]> {
  const q = normalizeSearch(query);
  if (!q) return [];
  const r = await cached(db, `search:${q}`, SEARCH_TTL, () => fetchSearch(q), now);
  pruneExpired(db, "search:", now);
  return r?.data ?? [];
}
