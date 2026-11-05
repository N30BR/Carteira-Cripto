// Fechamento e vencimento das faturas (funções puras, sem banco). A fatura de cada mês fecha no dia de
// fechamento do cartão e é paga no próprio mês, no dia de vencimento (ex.: novembro fecha dia 11 e vence
// dia 18). Compras a partir do dia de fechamento entram na fatura do mês seguinte.
import { addMonths } from "./months";

const lastDay = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/**
 * Data (AAAA-MM-DD) em que vence a fatura do mês "AAAA-MM": no próprio mês, no dia do vencimento.
 * Se o vencimento é antes do fechamento (ex.: fecha 25, vence 5), vence no mês seguinte.
 * Dia maior que o mês → último dia; sem dia → dia 1.
 */
export function dueDate(invoiceMonth: string, dueDay: number | null, closingDay: number | null = null): string {
  const month = dueDay !== null && closingDay !== null && dueDay < closingDay ? addMonths(invoiceMonth, 1) : invoiceMonth;
  const day = Math.min(dueDay ?? 1, lastDay(month));
  return `${month}-${String(day).padStart(2, "0")}`;
}

export type CardDays = { dueDay: number | null; closingDay: number | null };

/** Fatura (AAAA-MM) de uma compra feita em `purchaseDate`: a partir do dia de fechamento, vai para o mês seguinte. */
export function invoiceMonthFor(purchaseDate: string, closingDay: number | null): string {
  const month = purchaseDate.slice(0, 7);
  if (closingDay === null) return month;
  const closes = Math.min(closingDay, lastDay(month));
  return Number(purchaseDate.slice(8, 10)) >= closes ? addMonths(month, 1) : month;
}

/** Soma das parcelas cujas faturas vencem entre `from` e `to` (datas inclusivas). */
export function invoicesDueBetween(
  rows: { accountId: number; invoiceMonth: string; amountCents: number }[],
  days: Record<number, CardDays>,
  from: string,
  to: string,
): number {
  let sum = 0;
  for (const r of rows) {
    const c = days[r.accountId];
    const d = dueDate(r.invoiceMonth, c?.dueDay ?? null, c?.closingDay ?? null);
    if (d >= from && d <= to) sum += r.amountCents;
  }
  return sum;
}

/**
 * Valor que o formulário de edição mostra: do jeito que foi lançado ("parcela" ou "total").
 * Compras antigas, sem o modo guardado: parcela quando o total divide certinho pelas parcelas.
 */
export function editAmount(e: { totalCents: number; installments: number; amountMode: string | null }): {
  mode: "parcela" | "total";
  amountCents: number;
} {
  const exact = e.totalCents % e.installments === 0;
  const mode = e.amountMode === "parcela" || e.amountMode === "total" ? e.amountMode : exact ? "parcela" : "total";
  if (mode === "parcela" && exact) return { mode, amountCents: e.totalCents / e.installments };
  return { mode: "total", amountCents: e.totalCents };
}
