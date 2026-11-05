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
  description: "x",
  nature: "PF",
  card: "PF",
  categoryId: 1,
  categoryName: "Alimentação",
  notes: "",
  purchaseDate: "2026-11-01",
  firstInvoice: "2026-11",
  totalCents: 1000,
  ...o,
});

const rows = [
  row({ amountCents: 25000, nature: "PJ", card: "PF", categoryName: "Gasolina", paid: true }),
  row({ amountCents: 30000, nature: "PJ", card: "PJ", categoryName: "Equipamentos", number: 3, installments: 12, expenseId: 900 }),
  row({ amountCents: 3990, nature: "PF", card: "PF", categoryName: "Assinaturas", paid: true }),
  row({ amountCents: 48275, nature: "PF", card: "PJ", categoryName: null, categoryId: null }),
  row({ invoiceMonth: "2026-10", amountCents: 10000, card: "PJ" }),
  row({ invoiceMonth: "2026-12", amountCents: 30000, nature: "PJ", card: "PJ", number: 4, installments: 12, expenseId: 900 }),
  row({ invoiceMonth: "2027-01", amountCents: 30000, nature: "PJ", card: "PJ", number: 5, installments: 12, expenseId: 900, paid: true }),
];

describe("totais do mês", () => {
  test("cartões e naturezas fecham com o total, sem somar entre si", () => {
    const t = monthTotals(rows.filter((r) => r.invoiceMonth === "2026-11"));
    expect(t).toEqual({ total: 107265, pf: 52265, pj: 55000, cardPF: 28990, cardPJ: 78275, paid: 28990, pending: 78275, count: 4 });
    expect(t.cardPF + t.cardPJ).toBe(t.total);
    expect(t.pf + t.pj).toBe(t.total);
  });

  test("resumo de um cartão separa a natureza e o pago/pendente", () => {
    expect(cardSummary(rows.filter((r) => r.invoiceMonth === "2026-11"), "PF")).toEqual({
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
    expect(s[2]).toMatchObject({ month: "2026-11", cardPF: 28990, cardPJ: 78275, pf: 52265, pj: 55000 });
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
      { month: "2026-12", cardPF: 0, cardPJ: 30000, total: 30000 },
      { month: "2027-01", cardPF: 0, cardPJ: 30000, total: 30000 },
      { month: "2027-02", cardPF: 0, cardPJ: 0, total: 0 },
    ]);
    expect(p.pendingFuture).toBe(30000);
    expect(p.activePurchases).toBe(1);
  });
});
