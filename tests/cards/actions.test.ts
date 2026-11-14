import { beforeEach, describe, expect, test, vi } from "vitest";
import { testDb } from "../helpers/db";
import { users } from "@/db/schema";
import { createCategory, listCategories } from "@/lib/cards/categories";
import { ensureDefaultAccounts, listCardAccounts } from "@/lib/cards/accounts";
import { listInstallments } from "@/lib/cards/store";
import { resetFiatLimits } from "@/lib/fiat/limit";

const state = vi.hoisted(() => ({ db: null as unknown, userId: 0 }));
vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: () => state.db }));
vi.mock("@/lib/auth/current", () => ({ requireUser: async () => ({ id: state.userId }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import {
  createCardAccountAction,
  createCategoryAction,
  deleteCardAccountAction,
  deleteCategoryAction,
  deleteExpenseAction,
  deleteAllExpensesAction,
  renameCategoryAction,
  saveExpenseAction,
  setCardClosingDayAction,
  setCardDueDayAction,
  toggleInstallmentAction,
  updateCardAccountAction,
  type ExpenseForm,
} from "@/app/(app)/lancamentos/actions";

type Db = Parameters<typeof listInstallments>[0];
let other = 0;

const form = (o: Partial<ExpenseForm> = {}): ExpenseForm => ({
  description: "Notebook",
  amount: "350,00",
  mode: "parcela",
  current: 6,
  total: 12,
  refMonth: "2025-05",
  purchaseDate: "2024-11-20",
  accountId: 2,
  categoryId: null,
  currentPaid: false,
  notes: "",
  ...o,
});

beforeEach(() => {
  resetFiatLimits();
  const db = testDb();
  state.db = db;
  const mk = (username: string) =>
    db.insert(users).values({ username, passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0].id;
  state.userId = mk("ana");
  other = mk("bia");
  // Contas: ana = 1 (Cartão PF) e 2 (Cartão PJ); bia = 3 e 4.
  ensureDefaultAccounts(db, state.userId);
  ensureDefaultAccounts(db, other);
});

const mine = () => listInstallments(state.db as Db, state.userId, "2000-01", "2099-12");

describe("lançamentos", () => {
  test("cria compra parcelada a partir do formulário", async () => {
    expect(await saveExpenseAction(null, form())).toEqual({ ok: true });
    const rows = mine();
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({ invoiceMonth: "2024-12", amountCents: 35000, paid: true });
    expect(rows.find((r) => r.number === 6)).toMatchObject({ invoiceMonth: "2025-05", paid: false });
  });

  test("valida descrição, valor, parcelas, conta, mês e data", async () => {
    expect((await saveExpenseAction(null, form({ description: "  " }))).ok).toBe(false);
    expect((await saveExpenseAction(null, form({ description: "a​b" }))).ok).toBe(false);
    expect(await saveExpenseAction(null, form({ amount: "abc" }))).toEqual({ ok: false, error: "Valor inválido" });
    expect(await saveExpenseAction(null, form({ amount: "0" }))).toEqual({ ok: false, error: "Informe um valor maior que zero" });
    expect(await saveExpenseAction(null, form({ amount: "-5" }))).toEqual({ ok: false, error: "Informe um valor maior que zero" });
    expect((await saveExpenseAction(null, form({ current: 13 }))).ok).toBe(false);
    expect(await saveExpenseAction(null, form({ accountId: "2" as unknown as number }))).toEqual({ ok: false, error: "Escolha o cartão / conta" });
    expect(await saveExpenseAction(null, form({ accountId: 3 }))).toEqual({ ok: false, error: "Conta inválida" });
    expect((await saveExpenseAction(null, form({ refMonth: "2025-13" }))).ok).toBe(false);
    expect((await saveExpenseAction(null, form({ purchaseDate: "2999-01-01" }))).ok).toBe(false);
    expect((await saveExpenseAction(null, form({ notes: "x".repeat(501) }))).ok).toBe(false);
    expect((await saveExpenseAction(null, form({ mode: "hack" as "total" }))).ok).toBe(false);
    expect(mine()).toEqual([]);
  });

  test("editar preserva parcelas pagas; marcar parcela; excluir", async () => {
    await saveExpenseAction(null, form());
    const r6 = mine().find((r) => r.number === 6)!;
    expect(await toggleInstallmentAction(r6.installmentId, true)).toEqual({ ok: true });
    expect(await saveExpenseAction(r6.expenseId, form({ total: 6, amount: "350,00" }))).toEqual({ ok: true });
    expect(mine().filter((r) => r.paid).map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(await deleteExpenseAction(r6.expenseId)).toEqual({ ok: true });
    expect(mine()).toEqual([]);
  });

  test("não mexe em compras, parcelas ou categorias de outra pessoa; ids inválidos recusados", async () => {
    state.userId = other;
    await saveExpenseAction(null, form({ accountId: 3 }));
    createCategory(state.db as Db, other, "Dela");
    const hers = mine()[0];
    const herCat = listCategories(state.db as Db, other)[0].id;
    state.userId = (state.db as Db).select().from(users).all()[0].id; // volta para "ana"
    const nf = { ok: false, error: "Lançamento não encontrado" };
    expect(await saveExpenseAction(hers.expenseId, form())).toEqual(nf);
    expect(await deleteExpenseAction(hers.expenseId)).toEqual(nf);
    expect(await toggleInstallmentAction(hers.installmentId, true)).toEqual(nf);
    expect(await saveExpenseAction(null, form({ categoryId: herCat }))).toEqual({ ok: false, error: "Categoria inválida" });
    expect(await renameCategoryAction(herCat, "Minha")).toEqual({ ok: false, error: "Categoria não encontrada" });
    expect(await deleteCategoryAction(herCat)).toEqual({ ok: false, error: "Categoria não encontrada" });
    expect(await deleteExpenseAction("1" as unknown as number)).toEqual(nf);
    expect(await toggleInstallmentAction(1.5, true)).toEqual(nf);
    expect(await toggleInstallmentAction(hers.installmentId, "sim" as unknown as boolean)).toEqual(nf);
  });

  test("contas: criar, renomear com tipo, até 4, sem excluir conta com lançamentos nem mexer na de outra pessoa", async () => {
    expect(await createCardAccountAction("  Nubank ", "PF")).toEqual({ ok: true });
    expect((await createCardAccountAction("Inter", "XX" as "PF")).ok).toBe(false);
    expect((await createCardAccountAction("a‮b", "PF")).ok).toBe(false);
    expect(await createCardAccountAction("Inter PJ", "PJ")).toEqual({ ok: true });
    expect(await createCardAccountAction("Quinta", "PF")).toEqual({ ok: false, error: "Limite de 4 contas atingido" });
    const nubank = listCardAccounts(state.db as Db, state.userId).find((a) => a.name === "Nubank")!;
    expect(await updateCardAccountAction(nubank.id, "Nubank Roxo", "PJ")).toEqual({ ok: true });
    expect(listCardAccounts(state.db as Db, state.userId).find((a) => a.id === nubank.id)).toEqual({ id: nubank.id, name: "Nubank Roxo", kind: "PJ", closingDay: null, dueDay: null });
    await saveExpenseAction(null, form({ accountId: nubank.id }));
    expect(mine()[0]).toMatchObject({ nature: "PJ", accountName: "Nubank Roxo" });
    expect((await deleteCardAccountAction(nubank.id)).ok).toBe(false);
    expect(await updateCardAccountAction(3, "Hack", "PF")).toEqual({ ok: false, error: "Conta não encontrada" });
    expect(await deleteCardAccountAction(3)).toEqual({ ok: false, error: "Conta não encontrada" });
    expect(await deleteCardAccountAction(1.5)).toEqual({ ok: false, error: "Conta não encontrada" });
  });

  test("guarda se o valor foi informado como parcela ou total (para a edição)", async () => {
    await saveExpenseAction(null, form());
    expect(mine()[0].amountMode).toBe("parcela");
    await saveExpenseAction(mine()[0].expenseId, form({ mode: "total", amount: "4.200,00" }));
    expect(mine()[0].amountMode).toBe("total");
  });

  test("vencimento por conta: 1 a 31, vazio limpa; só nas próprias contas", async () => {
    expect(await setCardDueDayAction(1, 10)).toEqual({ ok: true });
    expect(listCardAccounts(state.db as Db, state.userId)[0].dueDay).toBe(10);
    expect(await setCardDueDayAction(1, null)).toEqual({ ok: true });
    expect((await setCardDueDayAction(1, 32)).ok).toBe(false);
    expect((await setCardDueDayAction(1, "10" as unknown as number)).ok).toBe(false);
    expect(await setCardDueDayAction(3, 10)).toEqual({ ok: false, error: "Conta não encontrada" });
    expect(await setCardDueDayAction(1.5, 10)).toEqual({ ok: false, error: "Conta não encontrada" });
  });

  test("fechamento por conta: 1 a 31, vazio limpa; só nas próprias contas", async () => {
    expect(await setCardClosingDayAction(1, 11)).toEqual({ ok: true });
    expect(listCardAccounts(state.db as Db, state.userId)[0].closingDay).toBe(11);
    expect((await setCardClosingDayAction(1, 0)).ok).toBe(false);
    expect((await setCardClosingDayAction(1, "11" as unknown as number)).ok).toBe(false);
    expect(await setCardClosingDayAction(3, 11)).toEqual({ ok: false, error: "Conta não encontrada" });
    expect(await setCardClosingDayAction(1, null)).toEqual({ ok: true });
  });

  test("categorias: criar e renomear com validação de nome", async () => {
    expect(await createCategoryAction("  Viagens ")).toEqual({ ok: true });
    expect((await createCategoryAction("a\nb")).ok).toBe(false);
    const id = listCategories(state.db as Db, state.userId)[0].id;
    expect(await renameCategoryAction(id, "Hospedagem")).toEqual({ ok: true });
    expect(listCategories(state.db as Db, state.userId)[0].name).toBe("Hospedagem");
  });

  test("limite de alterações por minuto", async () => {
    for (let i = 0; i < 60; i++) await createCategoryAction(`C${i}`);
    expect(await createCategoryAction("Extra")).toEqual({ ok: false, error: "Muitas alterações seguidas. Aguarde um minuto." });
  });
});

describe("Excluir todas (ação)", () => {
  test("apaga só as faturas da pessoa logada e recusa quando não há nenhuma", async () => {
    await saveExpenseAction(null, form());
    state.userId = other;
    await saveExpenseAction(null, form({ accountId: 3 }));
    state.userId = other - 1;
    expect(mine()).toHaveLength(12);
    expect(await deleteAllExpensesAction()).toEqual({ ok: true, expenses: 1, installments: 12 });
    expect(mine()).toEqual([]);
    expect(listInstallments(state.db as Db, other, "2000-01", "2099-12")).toHaveLength(12);
    expect(await deleteAllExpensesAction()).toEqual({ ok: false, error: "Não há faturas para excluir" });
  });
});
