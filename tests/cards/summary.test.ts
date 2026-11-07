import { describe, expect, test } from "vitest";
import type { InstallmentRow } from "@/lib/cards/store";
import { cardSummary, categoryBreakdown, monthTotals, monthlySeries, projection, topCategories } from "@/lib/cards/summary";

let id = 0;
const row = (o: Partial<InstallmentRow>): InstallmentRow => ({
  installmentId: ++id,
  expenseId: o.expenseId ?? id,
  number: 1,
  installments: 1,
  invoiceMonth: "2026-11",
  amountCents: 1000,
  paid: false,
  settled: false,
  description: "x",
  nature: "PF",
  card: "PF",
  accountId: 1,
  accountName: "Cartão PF",
  categoryId: 1,
  categoryName: "Alimentação",
  notes: "",
  purchaseDate: "2026-11-01",
  firstInvoice: "2026-11",
  totalCents: 1000,
  amountMode: null,
  ...o,
});

const rows = [
  row({ amountCents: 25000, nature: "PJ", card: "PF", categoryName: "Gasolina", paid: true }),
  row({ amountCents: 30000, nature: "PJ", card: "PJ", accountId: 2, accountName: "Cartão PJ", categoryName: "Equipamentos", number: 3, installments: 12, expenseId: 900 }),
  row({ amountCents: 3990, nature: "PF", card: "PF", categoryName: "Assinaturas", paid: true }),
  row({ amountCents: 48275, nature: "PF", card: "PJ", accountId: 2, accountName: "Cartão PJ", categoryName: null, categoryId: null }),
  row({ invoiceMonth: "2026-10", amountCents: 10000, card: "PJ", accountId: 2, accountName: "Cartão PJ" }),
  row({ invoiceMonth: "2026-12", amountCents: 30000, nature: "PJ", card: "PJ", accountId: 2, accountName: "Cartão PJ", number: 4, installments: 12, expenseId: 900 }),
  row({ invoiceMonth: "2027-01", amountCents: 30000, nature: "PJ", card: "PJ", accountId: 2, accountName: "Cartão PJ", number: 5, installments: 12, expenseId: 900, paid: true }),
];

describe("totais do mês", () => {
  test("cartões e naturezas fecham com o total, sem somar entre si", () => {
    const t = monthTotals(rows.filter((r) => r.invoiceMonth === "2026-11"));
    expect(t).toEqual({ total: 107265, pf: 52265, pj: 55000, byAccount: { 1: 28990, 2: 78275 }, paid: 28990, pending: 78275, count: 4 });
    expect(t.byAccount[1] + t.byAccount[2]).toBe(t.total);
    expect(t.pf + t.pj).toBe(t.total);
  });

  test("resumo de uma conta separa a natureza e o pago/pendente", () => {
    expect(cardSummary(rows.filter((r) => r.invoiceMonth === "2026-11"), 1)).toEqual({
      total: 28990,
      pf: 3990,
      pj: 25000,
      paid: 28990,
      pending: 0,
    });
  });
});

describe("séries e categorias", () => {
  test("série mensal inclui meses sem gastos", () => {
    const s = monthlySeries(rows, ["2026-09", "2026-10", "2026-11"]);
    expect(s.map((m) => m.total)).toEqual([0, 10000, 107265]);
    expect(s[2]).toMatchObject({ month: "2026-11", byAccount: { 1: 28990, 2: 78275 }, pf: 52265, pj: 55000 });
  });

  test("categorias por valor, com 'Sem categoria' e filtro de natureza", () => {
    const nov = rows.filter((r) => r.invoiceMonth === "2026-11");
    expect(categoryBreakdown(nov, "ALL")).toEqual([
      { name: "Sem categoria", cents: 48275 },
      { name: "Equipamentos", cents: 30000 },
      { name: "Gasolina", cents: 25000 },
      { name: "Assinaturas", cents: 3990 },
    ]);
    expect(categoryBreakdown(nov, "PJ").map((c) => c.name)).toEqual(["Equipamentos", "Gasolina"]);
    expect(topCategories(nov, 3)).toEqual(["Sem categoria", "Equipamentos", "Gasolina"]);
  });
});

describe("projeção", () => {
  test("próximos meses, total pendente futuro e compras parceladas ativas", () => {
    const p = projection(rows, "2026-11", 3);
    expect(p.months).toEqual([
      { month: "2026-12", byAccount: { 2: 30000 }, total: 30000 },
      { month: "2027-01", byAccount: { 2: 30000 }, total: 30000 },
      { month: "2027-02", byAccount: {}, total: 0 },
    ]);
    expect(p.pendingFuture).toBe(30000);
    expect(p.activePurchases).toBe(1);
  });
});

describe("compras parceladas em aberto (o que falta pagar até a última parcela)", () => {
  // Notebook 12× de R$ 100,00, de jan a dez/2026.
  const months = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);
  const notebook = (paidUpTo: number) =>
    months.map((m, i) =>
      row({ expenseId: 500, description: "Notebook", number: i + 1, installments: 12, invoiceMonth: m, firstInvoice: "2026-01", amountCents: 10000, paid: i + 1 <= paidUpTo }),
    );

  test("outubro (10/12) pago: faltam novembro e dezembro", async () => {
    const { openPurchases } = await import("@/lib/cards/summary");
    const [p] = openPurchases(notebook(10), "2026-10");
    expect(p).toMatchObject({ expenseId: 500, paidCount: 10, remainingCount: 2, remainingCents: 20000, nextMonth: "2026-11", lastMonth: "2026-12", overdueCount: 0 });
  });

  test("outubro não pago: faltam outubro, novembro e dezembro", async () => {
    const { openPurchases } = await import("@/lib/cards/summary");
    const [p] = openPurchases(notebook(9), "2026-10");
    expect(p).toMatchObject({ remainingCount: 3, remainingCents: 30000, nextMonth: "2026-10", overdueCount: 0 });
    // Vista de novembro: a de outubro continua em aberto, agora em atraso.
    expect(openPurchases(notebook(9), "2026-11")[0]).toMatchObject({ remainingCount: 3, overdueCount: 1, overdueCents: 10000 });
  });

  test("com só as parcelas não pagas (como a página carrega), o resultado é o mesmo", async () => {
    const { openPurchases } = await import("@/lib/cards/summary");
    const rows = notebook(9).map((r) => ({ ...r, firstInvoice: "2026-01" }));
    expect(openPurchases(rows.filter((r) => !r.paid), "2026-11")).toEqual(openPurchases(rows, "2026-11"));
  });

  test("compra totalmente paga não aparece; ordem pela próxima parcela a pagar", async () => {
    const { openPurchases } = await import("@/lib/cards/summary");
    const other = [row({ expenseId: 600, description: "Curso", number: 1, installments: 2, invoiceMonth: "2026-09", firstInvoice: "2026-09", amountCents: 5000 })];
    expect(openPurchases(notebook(12), "2026-10")).toEqual([]);
    expect(openPurchases([...notebook(10), ...other], "2026-10").map((p) => p.expenseId)).toEqual([600, 500]);
  });
});
