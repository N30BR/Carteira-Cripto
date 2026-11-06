// Parâmetros da aba Gráficos (sem dependências de banco ou navegador).

// "1m" = 1 minuto; "1M" = 1 mês; "1w" = 1 semana (aparece como "1S").
// "2d" é montado a partir das diárias; "6M" e "1y", a partir das mensais.
export const CHART_INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "6h", "12h", "1d", "2d", "3d", "1w", "1M", "6M", "1y"] as const;
export type ChartInterval = (typeof CHART_INTERVALS)[number];
/** Tempos que a Binance não tem: de qual tempo vêm e quantas velas dele cada uma junta. */
export const AGGREGATED: Partial<Record<ChartInterval, { base: "1d" | "1M"; count: number }>> = {
  "2d": { base: "1d", count: 2 },
  "6M": { base: "1M", count: 6 },
  "1y": { base: "1M", count: 12 },
};
const DAY_MS = 86_400_000;

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

/**
 * Junta velas: diárias em pares de dias (alinhados a 01/01/1970, UTC) para 2D; mensais em
 * semestres (jan–jun, jul–dez) para 6M ou anos para 1A, pelo calendário UTC.
 */
export function aggregateCandles<T extends Bar>(source: T[], interval: "2d" | "6M" | "1y", opts: { dropPartialFirst?: boolean } = {}): Bar[] {
  const { base, count } = AGGREGATED[interval] as { base: "1d" | "1M"; count: number };
  const bucket = (ts: number) => {
    if (base === "1d") return Math.floor(ts / (count * DAY_MS)) * count * DAY_MS;
    const d = new Date(ts);
    return Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / count) * count, 1);
  };
  const out: Bar[] = [];
  const members: number[] = [];
  let missingBuy = false;
  for (const k of source) {
    const start = bucket(k.timestamp);
    if (out.at(-1)?.timestamp === start) members[members.length - 1]++;
    else members.push(1);
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
  // Histórico cortado (não é o começo real da listagem): o 1º grupo pode ter só parte das velas.
  if (opts.dropPartialFirst && out.length > 1 && members[0] < count) out.shift();
  return out;
}
