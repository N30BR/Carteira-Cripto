// Parâmetros da aba Gráficos (sem dependências de banco ou navegador).

// "1m" = 1 minuto; "1M" = 1 mês; "1w" = 1 semana (aparece como "1S"); "6M" e "1y" são montados a partir das mensais.
export const CHART_INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "6h", "12h", "1d", "3d", "1w", "1M", "6M", "1y"] as const;
export type ChartInterval = (typeof CHART_INTERVALS)[number];
/** Tempos que a Binance não tem: quantos meses cada vela junta. */
export const AGGREGATED: Partial<Record<ChartInterval, number>> = { "6M": 6, "1y": 12 };

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

type Bar = { timestamp: number; open: number; high: number; low: number; close: number; volume: number; buyVolume?: number };

/** Junta velas mensais em semestres (jan–jun, jul–dez) ou anos, pelo calendário UTC. */
export function aggregateCandles<T extends Bar>(monthly: T[], interval: "6M" | "1y"): Bar[] {
  const span = AGGREGATED[interval] as number;
  const out: Bar[] = [];
  let missingBuy = false;
  for (const k of monthly) {
    const d = new Date(k.timestamp);
    const start = Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / span) * span, 1);
    const last = out.at(-1);
    if (!last || last.timestamp !== start) {
      missingBuy = k.buyVolume === undefined;
      out.push({ timestamp: start, open: k.open, high: k.high, low: k.low, close: k.close, volume: k.volume, ...(missingBuy ? {} : { buyVolume: k.buyVolume }) });
      continue;
    }
    last.high = Math.max(last.high, k.high);
    last.low = Math.min(last.low, k.low);
    last.close = k.close;
    last.volume += k.volume;
    if (k.buyVolume === undefined) missingBuy = true;
    if (missingBuy) delete last.buyVolume;
    else last.buyVolume = (last.buyVolume ?? 0) + (k.buyVolume as number);
  }
  return out;
}
