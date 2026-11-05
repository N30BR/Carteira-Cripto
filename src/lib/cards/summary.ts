import { addMonths } from "./months";
import type { InstallmentRow, Side } from "./store";

// Todos os valores em centavos. Conta/cartão e natureza (PF/PJ) são duas classificações
// dos mesmos lançamentos: cada uma soma o total, e nunca se somam entre si.

/** Centavos por id de conta (contas sem gasto não aparecem; use `?? 0`). */
export type ByAccount = Record<number, number>;

export type MonthTotals = {
  total: number;
  pf: number;
  pj: number;
  byAccount: ByAccount;
  paid: number;
  pending: number;
  count: number;
};

export function monthTotals(rows: InstallmentRow[]): MonthTotals {
  const t: MonthTotals = { total: 0, pf: 0, pj: 0, byAccount: {}, paid: 0, pending: 0, count: rows.length };
  for (const r of rows) {
    t.total += r.amountCents;
    if (r.nature === "PF") t.pf += r.amountCents;
    else t.pj += r.amountCents;
    t.byAccount[r.accountId] = (t.byAccount[r.accountId] ?? 0) + r.amountCents;
    if (r.paid) t.paid += r.amountCents;
    else t.pending += r.amountCents;
  }
  return t;
}

/** Fatura de uma conta: total, quanto é de natureza PF e PJ, pago e pendente. */
export function cardSummary(rows: InstallmentRow[], accountId: number) {
  const t = monthTotals(rows.filter((r) => r.accountId === accountId));
  return { total: t.total, pf: t.pf, pj: t.pj, paid: t.paid, pending: t.pending };
}

export type MonthPoint = { month: string; byAccount: ByAccount; pf: number; pj: number; total: number };

/** Um ponto por mês pedido (meses sem gasto entram com zero). */
export function monthlySeries(rows: InstallmentRow[], months: string[]): MonthPoint[] {
  return months.map((month) => {
    const t = monthTotals(rows.filter((r) => r.invoiceMonth === month));
    return { month, byAccount: t.byAccount, pf: t.pf, pj: t.pj, total: t.total };
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
    return { month: m, byAccount: t.byAccount, total: t.total };
  });
  const pendingFuture = future.filter((r) => !r.paid).reduce((s, r) => s + r.amountCents, 0);
  const activePurchases = new Set(future.filter((r) => r.installments > 1).map((r) => r.expenseId)).size;
  return { months, pendingFuture, activePurchases };
}

export type OpenPurchase = {
  expenseId: number;
  description: string;
  accountId: number;
  accountName: string;
  installments: number;
  paidCount: number;
  /** Parcelas ainda não pagas (inclui as de meses anteriores não marcadas como pagas). */
  remainingCount: number;
  remainingCents: number;
  /** Mês da parcela em aberto mais antiga e da última parcela. */
  nextMonth: string;
  lastMonth: string;
  /** Em aberto de meses anteriores ao mês escolhido (em atraso). */
  overdueCount: number;
  overdueCents: number;
};

/**
 * Compras com parcelas ainda não pagas, até a última parcela. Uma parcela só sai da conta quando é
 * marcada como paga: se a de outubro não foi paga, ainda faltam outubro, novembro e dezembro.
 * `rows` precisa ter todas as parcelas das compras (não só as do mês).
 */
export function openPurchases(rows: InstallmentRow[], month: string): OpenPurchase[] {
  const byExpense = new Map<number, InstallmentRow[]>();
  for (const r of rows) (byExpense.get(r.expenseId) ?? byExpense.set(r.expenseId, []).get(r.expenseId)!).push(r);
  const out: OpenPurchase[] = [];
  for (const [expenseId, list] of byExpense) {
    const open = list.filter((r) => !r.paid);
    if (!open.length) continue;
    const overdue = open.filter((r) => r.invoiceMonth < month);
    const first = list[0];
    out.push({
      expenseId,
      description: first.description,
      accountId: first.accountId,
      accountName: first.accountName,
      installments: first.installments,
      paidCount: list.filter((r) => r.paid).length,
      remainingCount: open.length,
      remainingCents: open.reduce((s, r) => s + r.amountCents, 0),
      nextMonth: open.reduce((m, r) => (r.invoiceMonth < m ? r.invoiceMonth : m), open[0].invoiceMonth),
      lastMonth: list.reduce((m, r) => (r.invoiceMonth > m ? r.invoiceMonth : m), list[0].invoiceMonth),
      overdueCount: overdue.length,
      overdueCents: overdue.reduce((s, r) => s + r.amountCents, 0),
    });
  }
  return out.sort((a, b) => a.nextMonth.localeCompare(b.nextMonth) || a.description.localeCompare(b.description, "pt-BR"));
}
