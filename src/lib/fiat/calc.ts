import type { BalancePoint, FiatAccount } from "./accounts";

export type FiatPeriod = "30D" | "6M" | "1A" | "Tudo";
export const FIAT_PERIODS: FiatPeriod[] = ["30D", "6M", "1A", "Tudo"];
const PERIOD_DAYS: Record<Exclude<FiatPeriod, "Tudo">, number> = { "30D": 30, "6M": 182, "1A": 365 };

export function parseFiatPeriod(raw: unknown): FiatPeriod {
  return (FIAT_PERIODS as unknown[]).includes(raw) ? (raw as FiatPeriod) : "30D";
}

/** "AAAA-MM-DD" ± n dias. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Instante usado para desenhar um dia na curva: meio-dia UTC, que é o mesmo dia no Brasil. */
export function dayTime(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 12);
}

/** Saldo da conta naquele dia: o último registrado até a data; null se ainda não havia registro. */
export function balanceOn(points: BalancePoint[], date: string): number | null {
  let value: number | null = null;
  for (const p of points) {
    if (p.date > date) break;
    value = Number(p.amount);
  }
  return value;
}

function pctChange(now: number, past: number | null): number | null {
  return past === null || past <= 0 ? null : (now / past - 1) * 100;
}

export type FiatRow = {
  id: number;
  name: string;
  amount: number;
  date: string;
  share: number | null;
  past30: number | null;
  past365: number | null;
  change1m: number | null;
  change1y: number | null;
};

/** Saldo total, participação e variações 1M/1A de cada conta (em reais). */
export function computeFiat(
  accounts: FiatAccount[],
  balances: Record<number, BalancePoint[]>,
  today: string,
): { rows: FiatRow[]; total: number; total30: number | null } {
  const d30 = addDays(today, -30);
  const d365 = addDays(today, -365);
  let total = 0;
  let total30 = 0;
  let anyPast = false;

  const rows = accounts.map((a) => {
    const pts = balances[a.id] ?? [];
    const amount = Number(a.amount);
    const past30 = balanceOn(pts, d30);
    const past365 = balanceOn(pts, d365);
    total += amount;
    if (past30 !== null) {
      total30 += past30;
      anyPast = true;
    }
    return {
      id: a.id,
      name: a.name,
      amount,
      date: a.date,
      share: null as number | null,
      past30,
      past365,
      change1m: pctChange(amount, past30),
      change1y: pctChange(amount, past365),
    };
  });

  for (const r of rows) r.share = total > 0 ? r.amount / total : null;
  rows.sort((a, b) => b.amount - a.amount);
  return { rows, total, total30: anyPast ? total30 : null };
}

/** Curva em degraus, um ponto por dia (até ontem) e o último ponto agora com os saldos atuais. */
export function buildFiatCurve(
  balances: Record<number, BalancePoint[]>,
  period: FiatPeriod,
  today: string,
  now = new Date(),
): { t: number; value: number }[] {
  const series = Object.values(balances).filter((pts) => pts.length);
  if (!series.length) return [];

  const first = series.map((pts) => pts[0].date).sort()[0];
  const start = period === "Tudo" ? first : addDays(today, -PERIOD_DAYS[period]);

  // Até ~1000 pontos: períodos longos andam de vários em vários dias.
  const totalDays = Math.round((dayTime(today) - dayTime(start)) / 86_400_000);
  const step = Math.max(1, Math.ceil(totalDays / 1000));

  const points: { t: number; value: number }[] = [];
  for (let d = start; d < today; d = addDays(d, step)) {
    points.push({ t: dayTime(d), value: series.reduce((s, pts) => s + (balanceOn(pts, d) ?? 0), 0) });
  }
  points.push({ t: now.getTime(), value: series.reduce((s, pts) => s + (balanceOn(pts, today) ?? 0), 0) });
  return points;
}
