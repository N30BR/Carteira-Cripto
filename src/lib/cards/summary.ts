import { addMonths } from "./months";
import type { InstallmentRow, Side } from "./store";

// Todos os valores em centavos. Cartão (PF/PJ) e natureza (PF/PJ) são duas classificações
// dos mesmos lançamentos: cada uma soma o total, e nunca se somam entre si.

export type MonthTotals = {
  total: number;
  pf: number;
  pj: number;
  cardPF: number;
  cardPJ: number;
  paid: number;
  pending: number;
  count: number;
};

export function monthTotals(rows: InstallmentRow[]): MonthTotals {
  const t: MonthTotals = { total: 0, pf: 0, pj: 0, cardPF: 0, cardPJ: 0, paid: 0, pending: 0, count: rows.length };
  for (const r of rows) {
    t.total += r.amountCents;
    if (r.nature === "PF") t.pf += r.amountCents;
    else t.pj += r.amountCents;
    if (r.card === "PF") t.cardPF += r.amountCents;
    else t.cardPJ += r.amountCents;
    if (r.paid) t.paid += r.amountCents;
    else t.pending += r.amountCents;
  }
  return t;
}

/** Fatura de um cartão: total, quanto é de natureza PF e PJ, pago e pendente. */
export function cardSummary(rows: InstallmentRow[], card: Side) {
  const t = monthTotals(rows.filter((r) => r.card === card));
  return { total: t.total, pf: t.pf, pj: t.pj, paid: t.paid, pending: t.pending };
}

export type MonthPoint = { month: string; cardPF: number; cardPJ: number; pf: number; pj: number; total: number };

/** Um ponto por mês pedido (meses sem gasto entram com zero). */
export function monthlySeries(rows: InstallmentRow[], months: string[]): MonthPoint[] {
  return months.map((month) => {
    const t = monthTotals(rows.filter((r) => r.invoiceMonth === month));
    return { month, cardPF: t.cardPF, cardPJ: t.cardPJ, pf: t.pf, pj: t.pj, total: t.total };
  });
}

export const NO_CATEGORY = "Sem categoria";

/** Gastos por categoria, do maior para o menor; `nature` filtra PF, PJ ou ambos. */
export function categoryBreakdown(rows: InstallmentRow[], nature: Side | "ALL"): { name: string; cents: number }[] {
  const sums = new Map<string, number>();
  for (const r of rows) {
    if (nature !== "ALL" && r.nature !== nature) continue;
    const name = r.categoryName ?? NO_CATEGORY;
    sums.set(name, (sums.get(name) ?? 0) + r.amountCents);
  }
  return [...sums.entries()]
    .map(([name, cents]) => ({ name, cents }))
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));
}

export function topCategories(rows: InstallmentRow[], n: number): string[] {
  return categoryBreakdown(rows, "ALL")
    .slice(0, n)
    .map((c) => c.name);
}

/**
 * Compromissos já cadastrados depois do mês escolhido: valor por cartão nos próximos `count` meses,
 * total ainda pendente nas faturas futuras e quantas compras parceladas seguem ativas.
 */
export function projection(rows: InstallmentRow[], month: string, count: number) {
  const future = rows.filter((r) => r.invoiceMonth > month);
  const months = Array.from({ length: count }, (_, i) => {
    const m = addMonths(month, i + 1);
    const t = monthTotals(future.filter((r) => r.invoiceMonth === m));
    return { month: m, cardPF: t.cardPF, cardPJ: t.cardPJ, total: t.total };
  });
  const pendingFuture = future.filter((r) => !r.paid).reduce((s, r) => s + r.amountCents, 0);
  const activePurchases = new Set(future.filter((r) => r.installments > 1).map((r) => r.expenseId)).size;
  return { months, pendingFuture, activePurchases };
}
