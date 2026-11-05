// Vencimento das faturas (funções puras, sem banco). A fatura de um mês é paga no mês seguinte,
// no dia de vencimento do cartão: a fatura de outubro vence em novembro.
import { addMonths } from "./months";

/** Data (AAAA-MM-DD) em que vence a fatura do mês "AAAA-MM". Dia maior que o mês → último dia; sem dia → dia 1. */
export function dueDate(invoiceMonth: string, dueDay: number | null): string {
  const month = addMonths(invoiceMonth, 1);
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(dueDay ?? 1, last);
  return `${month}-${String(day).padStart(2, "0")}`;
}

/** Soma das parcelas cujas faturas vencem entre `from` e `to` (datas inclusivas). */
export function invoicesDueBetween(
  rows: { accountId: number; invoiceMonth: string; amountCents: number }[],
  dueDays: Record<number, number | null>,
  from: string,
  to: string,
): number {
  let sum = 0;
  for (const r of rows) {
    const d = dueDate(r.invoiceMonth, dueDays[r.accountId] ?? null);
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
