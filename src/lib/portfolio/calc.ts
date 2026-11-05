import type { Holding } from "@/lib/holdings/holdings";

export type CurrentPrice = { usd: number; change24h: number | null };
export type PricePoint = [timestampMs: number, price: number];

export type PortfolioRow = Holding & {
  price: number | null;
  value: number | null;
  share: number | null;
  change24h: number | null;
};

export type Portfolio = {
  rows: PortfolioRow[];
  total: number;
  change24hUsd: number;
  change24hPct: number | null;
};

export function computePortfolio(holdings: Holding[], prices: Record<string, CurrentPrice>): Portfolio {
  let total = 0;
  let delta = 0;
  const rows: PortfolioRow[] = holdings.map((h) => {
    const p = prices[h.coinId];
    if (!p) return { ...h, price: null, value: null, share: null, change24h: null };
    const value = Number(h.quantity) * p.usd;
    total += value;
    if (p.change24h !== null && p.change24h > -100) {
      delta += value - value / (1 + p.change24h / 100);
    }
    return { ...h, price: p.usd, value, share: null, change24h: p.change24h };
  });

  for (const r of rows) {
    if (r.value !== null) r.share = total > 0 ? r.value / total : 0;
  }
  rows.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));

  const base = total - delta;
  return { rows, total, change24hUsd: delta, change24hPct: rows.length && base > 0 ? delta / base : null };
}

export type Period = "7D" | "30D" | "1A";

const HOUR = 3600_000;
export const PERIODS: Record<Period, { days: number; stepMs: number; sourceDays: 30 | 365 }> = {
  "7D": { days: 7, stepMs: HOUR, sourceDays: 30 },
  "30D": { days: 30, stepMs: 4 * HOUR, sourceDays: 30 },
  "1A": { days: 365, stepMs: 24 * HOUR, sourceDays: 365 },
};

export function parsePeriod(raw: unknown): Period {
  return raw === "7D" || raw === "30D" || raw === "1A" ? raw : "30D";
}

/**
 * Curva = Σ quantidade × último preço conhecido em cada instante (0 antes do primeiro preço).
 * Só usa moedas com preço atual, e termina em `now` com os preços atuais (igual ao total do card).
 */
export function buildCurve(
  holdings: Holding[],
  history: Record<string, PricePoint[]>,
  current: Record<string, CurrentPrice>,
  period: Period,
  now = new Date(),
): { points: { t: number; value: number }[]; missingHistory: string[] } {
  const priced = holdings.filter((h) => current[h.coinId]);
  if (!priced.length) return { points: [], missingHistory: [] };

  const missingHistory = priced.filter((h) => !history[h.coinId]?.length).map((h) => h.symbol.toUpperCase());
  const series = priced
    .filter((h) => history[h.coinId]?.length)
    .map((h) => ({
      qty: Number(h.quantity),
      pts: [...history[h.coinId]].sort((a, b) => a[0] - b[0]),
      i: -1,
    }));

  const { days, stepMs } = PERIODS[period];
  const end = now.getTime();
  const start = Math.ceil((end - days * 24 * HOUR) / stepMs) * stepMs;

  const points: { t: number; value: number }[] = [];
  for (let t = start; t < end; t += stepMs) {
    let value = 0;
    for (const s of series) {
      while (s.i + 1 < s.pts.length && s.pts[s.i + 1][0] <= t) s.i++;
      if (s.i >= 0) value += s.qty * s.pts[s.i][1];
    }
    points.push({ t, value });
  }

  const finalValue = priced.reduce((sum, h) => sum + Number(h.quantity) * current[h.coinId].usd, 0);
  points.push({ t: end, value: finalValue });
  return { points, missingHistory };
}
