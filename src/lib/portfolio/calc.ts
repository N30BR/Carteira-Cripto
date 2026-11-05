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
  /** null quando há ativos mas nenhum tem preço (mostrar "—", não US$ 0,00). */
  total: number | null;
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

  const anyPrice = rows.some((r) => r.price !== null);
  if (rows.length && !anyPrice) return { rows, total: null, change24hUsd: 0, change24hPct: null };
  const base = total - delta;
  return { rows, total, change24hUsd: delta, change24hPct: rows.length && base > 0 ? delta / base : null };
}

export type Period = "1D" | "1S" | "1M" | "3M" | "6M" | "1A";
export const PERIOD_OPTIONS: readonly Period[] = ["1D", "1S", "1M", "3M", "6M", "1A"];

const HOUR = 3600_000;
export const PERIODS: Record<Period, { days: number; stepMs: number; sourceDays: 30 | 365 }> = {
  "1D": { days: 1, stepMs: HOUR, sourceDays: 30 },
  "1S": { days: 7, stepMs: HOUR, sourceDays: 30 },
  "1M": { days: 30, stepMs: 4 * HOUR, sourceDays: 30 },
  "3M": { days: 90, stepMs: 24 * HOUR, sourceDays: 365 },
  "6M": { days: 182, stepMs: 24 * HOUR, sourceDays: 365 },
  "1A": { days: 365, stepMs: 24 * HOUR, sourceDays: 365 },
};

/** Aceita também os nomes antigos (7D, 30D) de links salvos. */
export function parsePeriod(raw: unknown): Period {
  if (raw === "7D") return "1S";
  return (PERIOD_OPTIONS as readonly unknown[]).includes(raw) ? (raw as Period) : "1M";
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
  // Sem nenhum histórico a curva seria uma linha em zero: melhor não desenhar.
  if (!series.length) return { points: [], missingHistory };

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

const DAY_MS = 24 * HOUR;

/** Variação % do preço em relação a `days` dias atrás; null sem histórico que cubra a data. */
export function priceChange(history: PricePoint[], currentPrice: number, days: number, now = new Date()): number | null {
  const target = now.getTime() - days * DAY_MS;
  let past: PricePoint | null = null;
  for (const point of history) {
    if (point[0] <= target && (past === null || point[0] >= past[0])) past = point;
  }
  if (past === null || past[1] <= 0) return null;
  return (currentPrice / past[1] - 1) * 100;
}

export type PeriodChanges = {
  change7d: number | null;
  change1m: number | null;
  change6m: number | null;
  change1y: number | null;
};

/** 1S e 1M saem do histórico de 30 dias (por hora); 6M e 1A do histórico de 1 ano (diário). */
export function periodChanges(
  ids: string[],
  prices: Record<string, CurrentPrice>,
  history30: Record<string, PricePoint[]>,
  history365: Record<string, PricePoint[]>,
  now = new Date(),
): Record<string, PeriodChanges> {
  const out: Record<string, PeriodChanges> = {};
  for (const id of ids) {
    const p = prices[id]?.usd;
    out[id] =
      p === undefined
        ? { change7d: null, change1m: null, change6m: null, change1y: null }
        : {
            change7d: priceChange(history30[id] ?? [], p, 7, now),
            change1m: priceChange(history30[id] ?? [], p, 30, now),
            change6m: priceChange(history365[id] ?? [], p, 182, now),
            change1y: priceChange(history365[id] ?? [], p, 365, now),
          };
  }
  return out;
}

/**
 * Variação do saldo total em `days` dias, comparando só as moedas que já tinham preço naquela data
 * (quantidades atuais × preço de então contra × preço de agora). null sem nenhum preço antigo.
 */
export function totalChange(
  holdings: Holding[],
  current: Record<string, CurrentPrice>,
  history: Record<string, PricePoint[]>,
  days: number,
  now = new Date(),
): { now: number; past: number; abs: number; pct: number | null } | null {
  const target = now.getTime() - days * DAY_MS;
  let nowSum = 0;
  let pastSum = 0;
  let any = false;
  for (const h of holdings) {
    const price = current[h.coinId]?.usd;
    if (price === undefined) continue;
    let past: PricePoint | null = null;
    for (const p of history[h.coinId] ?? []) if (p[0] <= target && (!past || p[0] >= past[0])) past = p;
    if (!past) continue;
    any = true;
    const qty = Number(h.quantity);
    nowSum += qty * price;
    pastSum += qty * past[1];
  }
  if (!any) return null;
  return { now: nowSum, past: pastSum, abs: nowSum - pastSum, pct: pastSum > 0 ? (nowSum / pastSum - 1) * 100 : null };
}
