import type { CurrentPrice, PricePoint } from "@/lib/portfolio/calc";

// API pública de dados de mercado da Binance (sem chave). Preços em USDT ≈ US$.
const MAX_CONCURRENT = 2;
const RETRY_DELAY_MS = 2000;
const TIMEOUT_MS = 8000;
const LISTING_TIMEOUT_MS = 20_000; // exchangeInfo tem alguns MB
const PAUSE_AFTER_FAILURE_MS = 60_000;

export const QUOTE = "USDT";

let active = 0;
const waiting: (() => void)[] = [];
// Depois de uma falha, não chama a API por um tempo: evita travar o dashboard
// repetindo requisições que vão falhar de novo.
let pausedUntil = 0;

export function resetBinanceState(): void {
  pausedUntil = 0;
}

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  // Quem sai passa a vaga direto para o próximo da fila, sem abrir brecha para um terceiro.
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get<T>(path: string, params: Record<string, string>, timeoutMs = TIMEOUT_MS): Promise<T> {
  const base = process.env.BINANCE_BASE_URL || "https://data-api.binance.vision";
  const url = `${base}${path}?${new URLSearchParams(params)}`;
  const request = () => fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });

  return withSlot(async () => {
    if (Date.now() < pausedUntil) throw new Error("Binance em pausa depois de uma falha");
    try {
      let res = await request();
      if (res.status === 429) {
        await sleep(RETRY_DELAY_MS);
        res = await request();
      }
      if (!res.ok) throw new Error(`Binance ${res.status} em ${path}`);
      return (await res.json()) as T;
    } catch (e) {
      pausedUntil = Date.now() + PAUSE_AFTER_FAILURE_MS;
      throw e;
    }
  });
}

/** Moedas negociadas contra USDT no mercado à vista (ex.: "BTC", "SOL"). */
export async function fetchUsdtAssets(): Promise<string[]> {
  const body = await get<{ symbols?: { baseAsset: string; quoteAsset: string; status: string }[] }>(
    "/api/v3/exchangeInfo",
    { permissions: "SPOT", symbolStatus: "TRADING" },
    LISTING_TIMEOUT_MS,
  );
  if (!Array.isArray(body.symbols)) throw new Error("Binance: exchangeInfo sem símbolos");
  const assets = body.symbols
    .filter((s) => s.quoteAsset === QUOTE && s.status === "TRADING")
    .map((s) => s.baseAsset);
  return [...new Set(assets)].sort();
}

/** Preço e variação 24h. Todos os ids precisam estar listados: um símbolo inválido derruba o pedido inteiro. */
export async function fetchTickers(ids: string[]): Promise<Record<string, CurrentPrice>> {
  const body = await get<{ symbol: string; lastPrice: string; priceChangePercent: string }[]>("/api/v3/ticker/24hr", {
    symbols: JSON.stringify(ids.map((id) => id + QUOTE)),
  });
  if (!Array.isArray(body)) throw new Error("Binance: resposta inesperada em ticker/24hr");
  const out: Record<string, CurrentPrice> = {};
  for (const t of body) {
    const usd = Number(t.lastPrice);
    if (!t.symbol.endsWith(QUOTE) || !Number.isFinite(usd)) continue;
    const change = Number(t.priceChangePercent);
    out[t.symbol.slice(0, -QUOTE.length)] = { usd, change24h: Number.isFinite(change) ? change : null };
  }
  return out;
}

/** Velas de fechamento: 30 dias de hora em hora ou 365 dias diários. Usa o horário de fechamento de cada vela. */
export async function fetchKlines(id: string, days: 30 | 365): Promise<PricePoint[]> {
  const params = days === 30 ? { interval: "1h", limit: "720" } : { interval: "1d", limit: "365" };
  const body = await get<unknown[][]>("/api/v3/klines", { symbol: id + QUOTE, ...params });
  if (!Array.isArray(body)) throw new Error(`Binance: sem histórico para ${id}`);
  return body
    .map((k) => [Number(k[6]), Number(k[4])] as PricePoint)
    .filter(([t, p]) => Number.isFinite(t) && Number.isFinite(p));
}
