// Parâmetros da aba Gráficos (sem dependências de banco ou navegador).

export const CHART_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"] as const;
export type ChartInterval = (typeof CHART_INTERVALS)[number];

/** Cotações aceitas nos pares (ex.: BTCUSDT, SOLBTC, LINKETH). */
export const CHART_QUOTES = ["USDT", "BTC", "ETH"] as const;
export type ChartQuote = (typeof CHART_QUOTES)[number];

export const MAX_CANDLES = 1000;

export type CandleQuery = { symbol: string; interval: ChartInterval; limit: number; end: number | null };

/** Valida ?symbol=&interval=&limit=&end= da rota de velas. A existência do par é conferida à parte. */
export function parseCandleQuery(q: URLSearchParams): { ok: true; value: CandleQuery } | { ok: false; error: string } {
  const symbol = (q.get("symbol") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{2,20}$/.test(symbol)) return { ok: false, error: "Par inválido" };
  const interval = q.get("interval") ?? "";
  if (!(CHART_INTERVALS as readonly string[]).includes(interval)) return { ok: false, error: "Tempo inválido" };
  const rawLimit = q.get("limit");
  const limit = rawLimit === null ? 500 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CANDLES) return { ok: false, error: "Quantidade inválida" };
  const rawEnd = q.get("end");
  const end = rawEnd === null || rawEnd === "" ? null : Number(rawEnd);
  if (end !== null && (!Number.isSafeInteger(end) || end <= 0)) return { ok: false, error: "Data inválida" };
  return { ok: true, value: { symbol, interval: interval as ChartInterval, limit, end } };
}

/** "SOLBTC" → { base: "SOL", quote: "BTC" }; null se a cotação não for USDT, BTC ou ETH. */
export function splitSymbol(symbol: string): { base: string; quote: ChartQuote } | null {
  for (const quote of CHART_QUOTES) {
    if (symbol.length > quote.length && symbol.endsWith(quote)) return { base: symbol.slice(0, -quote.length), quote };
  }
  return null;
}
