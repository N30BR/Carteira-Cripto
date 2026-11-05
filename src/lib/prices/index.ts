import type { Db } from "@/db/client";
import { PERIODS, type CurrentPrice, type Period, type PricePoint } from "@/lib/portfolio/calc";
import { normalizeSearch } from "@/lib/validation";
import { cached, readCache, writeCache } from "./cache";
import { BinanceError, QUOTE, fetchKlines, fetchTickers, fetchUsdtAssets } from "./binance";
import { coinName } from "./coin-names";

export type CoinSearchResult = { id: string; symbol: string; name: string };

const PRICE_TTL = 60_000;
const HISTORY_TTL = 60 * 60_000;
const LISTING_TTL = 24 * 60 * 60_000;
const DAY = 86_400_000;

/**
 * Moedas com par USDT ativo na Binance (mais o próprio USDT, que vale US$ 1).
 * null quando a lista não pôde ser obtida e não há cópia guardada.
 */
async function listedAssets(db: Db, now: Date): Promise<Set<string> | null> {
  const r = await cached(db, "assets:usdt", LISTING_TTL, fetchUsdtAssets, now);
  return r ? new Set([...r.data, QUOTE]) : null;
}

/** Moedas que podem ser pedidas à API. Sem a lista, tenta todas (a falha cai no cache antigo). */
function requestable(ids: string[], listed: Set<string> | null): string[] {
  return ids.filter((id) => id !== QUOTE && (listed === null || listed.has(id)));
}

/** true/false; null quando não dá para saber agora (lista indisponível). */
export async function isListedAsset(db: Db, id: string, now = new Date()): Promise<boolean | null> {
  const listed = await listedAssets(db, now);
  return listed ? listed.has(id) : null;
}

/** Busca em lote; se um símbolo for recusado (ex.: moeda deslistada), busca uma por uma. */
async function fetchTickersSafely(ids: string[]): Promise<Record<string, CurrentPrice>> {
  try {
    return await fetchTickers(ids);
  } catch (e) {
    if (!(e instanceof BinanceError && e.isRequestError) || ids.length === 1) throw e;
    const parts = await Promise.allSettled(ids.map((id) => fetchTickers([id])));
    return Object.assign({}, ...parts.map((p) => (p.status === "fulfilled" ? p.value : {})));
  }
}

export async function getCurrentPrices(
  db: Db,
  ids: string[],
  now = new Date(),
): Promise<{ prices: Record<string, CurrentPrice>; fetchedAt: Date | null; stale: boolean }> {
  const prices: Record<string, CurrentPrice> = {};
  let fetchedAt: Date | null = null;
  let stale = false;

  const unique = [...new Set(ids)].sort();
  if (!unique.length) return { prices, fetchedAt, stale };
  if (unique.includes(QUOTE)) prices[QUOTE] = { usd: 1, change24h: 0 };

  const coins = requestable(unique, await listedAssets(db, now));
  // Cache por moeda: adicionar uma moeda nova não descarta o preço guardado das outras.
  const hits = new Map(coins.map((id) => [id, readCache<CurrentPrice>(db, `price:${id}`, now)]));
  const toFetch = coins.filter((id) => !hits.get(id) || hits.get(id)!.stale);

  if (toFetch.length) {
    try {
      const fresh = await fetchTickersSafely(toFetch);
      for (const [id, price] of Object.entries(fresh)) {
        writeCache(db, `price:${id}`, price, PRICE_TTL, now);
        hits.set(id, { data: price, fetchedAt: now, stale: false });
      }
    } catch {
      // Sem resposta: segue com o que houver no cache (marcado como antigo).
    }
  }

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
  const history: Record<string, PricePoint[]> = {};
  let oldest: Date | null = null;
  let stale = false;

  const unique = [...new Set(ids)];
  if (unique.includes(QUOTE)) history[QUOTE] = [[now.getTime() - days * DAY, 1], [now.getTime(), 1]];

  const coins = requestable(unique, await listedAssets(db, now));
  const results = await Promise.all(
    coins.map(async (id) => [id, await cached(db, `chart:${id}:${days}`, HISTORY_TTL, () => fetchKlines(id, days), now)] as const),
  );
  for (const [id, r] of results) {
    if (!r) continue;
    history[id] = r.data;
    stale ||= r.stale;
    if (!oldest || r.fetchedAt < oldest) oldest = r.fetchedAt;
  }
  return { history, oldestFetchedAt: oldest, stale };
}

/**
 * Busca local na lista de moedas da Binance: símbolo ou nome exato, prefixo do símbolo, prefixo e trecho do nome.
 * null quando a lista está indisponível.
 */
export async function searchCoins(db: Db, query: string, now = new Date()): Promise<CoinSearchResult[] | null> {
  const q = normalizeSearch(query);
  if (!q) return [];
  const listed = await listedAssets(db, now);
  if (!listed) return null;
  const Q = q.toUpperCase();
  const rank = (id: string): number => {
    const name = coinName(id).toLowerCase();
    if (id === Q || name === q) return 0;
    if (id.startsWith(Q)) return 1;
    if (name.startsWith(q)) return 2;
    if (name.includes(q)) return 3;
    return -1;
  };
  return [...listed]
    .map((id) => ({ id, r: rank(id) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.id.localeCompare(b.id))
    .slice(0, 10)
    .map(({ id }) => ({ id, symbol: id, name: coinName(id) }));
}
