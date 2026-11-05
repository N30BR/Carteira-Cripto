import { addMonths, monthLabel } from "@/lib/cards/months";
import type { Holding } from "@/lib/holdings/holdings";
import type { Period, PricePoint } from "@/lib/portfolio/calc";

const MONTHS: Partial<Record<Period, number>> = { "1M": 1, "3M": 3, "6M": 6, "1A": 12 };
const DAYS: Partial<Record<Period, number>> = { "1D": 1, "1S": 7 };

const addDaysIso = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const lastDay = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

/**
 * Período do Resumo: começa no dia 1 do mês de referência e dura o período escolhido.
 * Datas inclusivas (AAAA-MM-DD) para as transações; meses de fatura que o período cobre.
 */
export function analysisWindow(month: string, period: Period): { fromDate: string; toDate: string; invoiceMonths: string[] } {
  const fromDate = `${month}-01`;
  const months = MONTHS[period];
  if (months) {
    const invoiceMonths = Array.from({ length: months }, (_, i) => addMonths(month, i));
    return { fromDate, toDate: lastDay(invoiceMonths.at(-1)!), invoiceMonths };
  }
  return { fromDate, toDate: addDaysIso(fromDate, (DAYS[period] ?? 1) - 1), invoiceMonths: [month] };
}

/**
 * Valor da carteira (em USDT) num instante: quantidade atual × último preço até `t`.
 * Só conta as moedas de `coins` (as mesmas nos dois lados da comparação). null se alguma não tiver preço até `t`.
 */
export function portfolioValueAt(holdings: Holding[], history: Record<string, PricePoint[]>, t: number, coins: string[]): number | null {
  let sum = 0;
  for (const h of holdings) {
    if (!coins.includes(h.coinId)) continue;
    let price: number | null = null;
    let at = -Infinity;
    for (const [ts, p] of history[h.coinId] ?? []) if (ts <= t && ts >= at) [at, price] = [ts, p];
    if (price === null) return null;
    sum += Number(h.quantity) * price;
  }
  return sum;
}

/** Instante (ms) da meia-noite do dia `iso` (AAAA-MM-DD) no fuso `timeZone`. */
export function zonedMidnight(iso: string, timeZone: string): number {
  const utc = Date.parse(`${iso}T00:00:00Z`);
  // Diferença entre o relógio do fuso e o UTC naquele instante (ex.: −3 h em São Paulo).
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(utc)
      .map((p) => [p.type, p.value]),
  );
  const asLocal = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return utc - (asLocal - utc);
}

const dateBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Texto do período: "Nov/2026" em 1M; "01/11/2026 a 31/01/2027" nos demais. */
export function periodLabel(month: string, period: Period): string {
  if (period === "1M") return monthLabel(month);
  const w = analysisWindow(month, period);
  return `${dateBr(w.fromDate)} a ${dateBr(w.toDate)}`;
}

/** Meses do gráfico mensal: até 1M, os 6 meses que terminam no mês; de 3M em diante, os meses do período. */
export function chartMonths(month: string, period: Period): string[] {
  const w = analysisWindow(month, period);
  if (w.invoiceMonths.length > 1) return w.invoiceMonths;
  return Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5));
}

/** Rótulo das faturas do período: faturas são mensais, então 1D, 1S e 1M mostram o mês. */
export function invoicePeriodLabel(month: string, period: Period): string {
  const m = analysisWindow(month, period).invoiceMonths;
  return m.length === 1 ? monthLabel(m[0]) : `${monthLabel(m[0])} a ${monthLabel(m.at(-1)!)}`;
}
