import type { CurrentPrice, PricePoint } from "@/lib/portfolio/calc";

const MAX_CONCURRENT = 2;
const RETRY_DELAY_MS = 2000;

let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const base = process.env.COINGECKO_BASE_URL || "https://api.coingecko.com/api/v3";
  const url = `${base}${path}?${new URLSearchParams(params)}`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;

  return withSlot(async () => {
    let res = await fetch(url, { headers, cache: "no-store" });
    if (res.status === 429) {
      await sleep(RETRY_DELAY_MS);
      res = await fetch(url, { headers, cache: "no-store" });
    }
    if (!res.ok) throw new Error(`CoinGecko ${res.status} em ${path}`);
    const body = await res.json();
    // A CoinGecko às vezes responde 200 com o erro no corpo (ex.: limite atingido).
    if (body?.status?.error_code) throw new Error(`CoinGecko ${body.status.error_code} em ${path}`);
    return body as T;
  });
}

export async function fetchSimplePrices(ids: string[]): Promise<Record<string, CurrentPrice>> {
  const body = await get<Record<string, { usd?: number; usd_24h_change?: number | null }>>("/simple/price", {
    ids: ids.join(","),
    vs_currencies: "usd",
    include_24hr_change: "true",
  });
  const out: Record<string, CurrentPrice> = {};
  for (const [id, v] of Object.entries(body)) {
    if (typeof v?.usd === "number") out[id] = { usd: v.usd, change24h: v.usd_24h_change ?? null };
  }
  return out;
}

export async function fetchMarketChart(id: string, days: 30 | 365): Promise<PricePoint[]> {
  const body = await get<{ prices?: PricePoint[] }>(`/coins/${encodeURIComponent(id)}/market_chart`, {
    vs_currency: "usd",
    days: String(days),
  });
  if (!Array.isArray(body.prices)) throw new Error(`CoinGecko sem histórico para ${id}`);
  return body.prices;
}

export type CoinSearchResult = { id: string; symbol: string; name: string; thumb: string };

export async function fetchSearch(query: string): Promise<CoinSearchResult[]> {
  const body = await get<{ coins?: CoinSearchResult[] }>("/search", { query });
  return (body.coins ?? []).slice(0, 10).map(({ id, symbol, name, thumb }) => ({ id, symbol, name, thumb }));
}
