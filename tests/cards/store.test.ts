import { describe, expect, test } from "vitest";
import { testDb } from "../helpers/db";
import { cardInstallments, users } from "@/db/schema";
import {
  DEFAULT_CATEGORIES,
  MAX_CATEGORIES,
  createCategory,
  deleteCategory,
  ensureDefaultCategories,
  listCategories,
  renameCategory,
} from "@/lib/cards/categories";
import {
  createExpense,
  deleteExpense,
  getExpense,
  listInstallments,
  setInstallmentPaid,
  updateExpense,
  type ExpenseInput,
} from "@/lib/cards/store";
import { ensureDefaultAccounts } from "@/lib/cards/accounts";

function setup() {
  const db = testDb();
  const mk = (username: string) =>
    db.insert(users).values({ username, passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0].id;
  const a = mk("ana");
  const b = mk("bia");
  // Contas: ana = 1 (Cartão PF) e 2 (Cartão PJ); bia = 3 e 4.
  ensureDefaultAccounts(db, a);
  ensureDefaultAccounts(db, b);
  return { db, a, b };
}

const base = (over: Partial<ExpenseInput> = {}): ExpenseInput => ({
  description: "Notebook",
  totalCents: 420000,
  installments: 12,
  firstInvoice: "2024-12",
  purchaseDate: "2024-11-20",
  accountId: 2,
  categoryId: null,
  notes: "",
  paidNumbers: [1, 2, 3, 4, 5],
  ...over,
});

describe("categorias", () => {
  test("cria as 13 padrão uma vez, sem pedágio", () => {
    const { db, a } = setup();
    ensureDefaultCategories(db, a);
    ensureDefaultCategories(db, a);
    const names = listCategories(db, a).map((c) => c.name);
    expect(names).toEqual(DEFAULT_CATEGORIES);
    expect(names).toHaveLength(13);
    expect(names.some((n) => /ped[aá]gio/i.test(n))).toBe(false);
  });

  test("não recria as padrão para quem já lançou e apagou todas", () => {
    const { db, a } = setup();
    ensureDefaultCategories(db, a);
    createExpense(db, a, base());
    for (const c of listCategories(db, a)) deleteCategory(db, a, c.id);
    ensureDefaultCategories(db, a);
    expect(listCategories(db, a)).toEqual([]);
  });

  test("criar, renomear (sem duplicar), excluir em uso vira 'sem categoria'", () => {
    const { db, a } = setup();
    expect(createCategory(db, a, "Viagens")).toEqual({ ok: true });
    expect(createCategory(db, a, "Viagens")).toEqual({ ok: false, error: "Já existe uma categoria com esse nome" });
    const [viagens] = listCategories(db, a);
    createExpense(db, a, base({ categoryId: viagens.id }));
    expect(renameCategory(db, a, viagens.id, "Hospedagem")).toEqual({ ok: true });
    expect(listInstallments(db, a, "2025-05", "2025-05")[0].categoryName).toBe("Hospedagem");
    expect(deleteCategory(db, a, viagens.id)).toEqual({ ok: true });
    const row = listInstallments(db, a, "2025-05", "2025-05")[0];
    expect(row.categoryId).toBeNull();
    expect(row.categoryName).toBeNull();
    expect(row.amountCents).toBe(35000);
  });

  test("limite de categorias", () => {
    const { db, a } = setup();
    for (let i = 0; i < MAX_CATEGORIES; i++) createCategory(db, a, `C${i}`);
    expect(createCategory(db, a, "Extra")).toEqual({ ok: false, error: `Limite de ${MAX_CATEGORIES} categorias atingido` });
  });
});

describe("compras e parcelas", () => {
  test("gera as parcelas, marca as anteriores pagas e lista só a do mês", () => {
    const { db, a } = setup();
    expect(createExpense(db, a, base())).toEqual({ ok: true });
    const may = listInstallments(db, a, "2025-05", "2025-05");
    expect(may).toHaveLength(1);
    expect(may[0]).toMatchObject({ number: 6, installments: 12, amountCents: 35000, paid: false, nature: "PJ", accountName: "Cartão PJ" });
    const all = listInstallments(db, a, "2000-01", "2099-12");
    expect(all.filter((r) => r.paid).map((r) => r.number)).toEqual([1, 2, 3, 4, 5]);
    expect(all.reduce((s, r) => s + r.amountCents, 0)).toBe(420000);
  });

  test("editar de 12 para 6 parcelas preserva os pagos e remove as sobras", () => {
    const { db, a } = setup();
    createExpense(db, a, base());
    const id = listInstallments(db, a, "2025-05", "2025-05")[0].expenseId;
    expect(updateExpense(db, a, id, { ...base({ installments: 6, totalCents: 210000 }), paidNumbers: [] })).toEqual({ ok: true });
    const all = listInstallments(db, a, "2000-01", "2099-12");
    expect(all.map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(all.filter((r) => r.paid).map((r) => r.number)).toEqual([1, 2, 3, 4, 5]);
    expect(all.every((r) => r.amountCents === 35000)).toBe(true);
  });

  test("marcar parcela paga/pendente", () => {
    const { db, a } = setup();
    createExpense(db, a, base());
    const row = listInstallments(db, a, "2025-05", "2025-05")[0];
    expect(setInstallmentPaid(db, a, row.installmentId, true)).toEqual({ ok: true });
    expect(listInstallments(db, a, "2025-05", "2025-05")[0].paid).toBe(true);
  });

  test("excluir remove compra e parcelas", () => {
    const { db, a } = setup();
    createExpense(db, a, base());
    const id = listInstallments(db, a, "2025-05", "2025-05")[0].expenseId;
    expect(deleteExpense(db, a, id)).toEqual({ ok: true });
    expect(db.select().from(cardInstallments).all()).toEqual([]);
  });

  test("ninguém mexe nas compras, parcelas ou categorias de outra pessoa", () => {
    const { db, a, b } = setup();
    ensureDefaultCategories(db, a);
    const catA = listCategories(db, a)[0].id;
    createExpense(db, a, base({ categoryId: catA }));
    const row = listInstallments(db, a, "2025-05", "2025-05")[0];
    const nf = { ok: false, error: "Lançamento não encontrado" };
    expect(updateExpense(db, b, row.expenseId, base())).toEqual(nf);
    expect(deleteExpense(db, b, row.expenseId)).toEqual(nf);
    expect(setInstallmentPaid(db, b, row.installmentId, true)).toEqual(nf);
    expect(getExpense(db, b, row.expenseId)).toBeNull();
    expect(listInstallments(db, b, "2000-01", "2099-12")).toEqual([]);
    expect(renameCategory(db, b, catA, "X")).toEqual({ ok: false, error: "Categoria não encontrada" });
    expect(deleteCategory(db, b, catA)).toEqual({ ok: false, error: "Categoria não encontrada" });
    // B não pode usar a categoria de A
    expect(createExpense(db, b, base({ accountId: 3, categoryId: catA }))).toEqual({ ok: false, error: "Categoria inválida" });
    // nem a conta de A
    expect(createExpense(db, b, base())).toEqual({ ok: false, error: "Conta inválida" });
    expect(listInstallments(db, a, "2025-05", "2025-05")[0].paid).toBe(false);
  });

  test("getExpense devolve a compra para edição", () => {
    const { db, a } = setup();
    createExpense(db, a, base({ notes: "nota" }));
    const id = listInstallments(db, a, "2025-05", "2025-05")[0].expenseId;
    expect(getExpense(db, a, id)).toMatchObject({ description: "Notebook", totalCents: 420000, installments: 12, firstInvoice: "2024-12", notes: "nota" });
  });
});
