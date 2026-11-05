import { describe, expect, test } from "vitest";
import { testDb } from "../helpers/db";
import { users } from "@/db/schema";
import {
  MAX_CARD_ACCOUNTS,
  createCardAccount,
  deleteCardAccount,
  ensureDefaultAccounts,
  listCardAccounts,
  updateCardAccount,
} from "@/lib/cards/accounts";
import { createExpense, listInstallments } from "@/lib/cards/store";

function setup() {
  const db = testDb();
  const mk = (username: string) =>
    db.insert(users).values({ username, passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0].id;
  return { db, u: mk("ana"), other: mk("bia") };
}

const expense = (accountId: number) => ({
  description: "Netflix",
  totalCents: 3490,
  installments: 1,
  firstInvoice: "2026-05",
  purchaseDate: "2026-05-02",
  accountId,
  categoryId: null,
  notes: "",
  paidNumbers: [],
});

describe("contas de cartão", () => {
  test("primeira visita cria Cartão PF e Cartão PJ; não cria de novo", () => {
    const { db, u } = setup();
    ensureDefaultAccounts(db, u);
    ensureDefaultAccounts(db, u);
    expect(listCardAccounts(db, u).map((a) => [a.name, a.kind])).toEqual([
      ["Cartão PF", "PF"],
      ["Cartão PJ", "PJ"],
    ]);
  });

  test("até quatro contas, nomes únicos por pessoa", () => {
    const { db, u, other } = setup();
    ensureDefaultAccounts(db, u);
    expect(createCardAccount(db, u, { name: "Nubank", kind: "PF" })).toEqual({ ok: true });
    expect(createCardAccount(db, u, { name: "Nubank", kind: "PJ" })).toEqual({ ok: false, error: "Já existe uma conta com esse nome" });
    expect(createCardAccount(db, u, { name: "Inter PJ", kind: "PJ" })).toEqual({ ok: true });
    expect(MAX_CARD_ACCOUNTS).toBe(4);
    expect(createCardAccount(db, u, { name: "Quinta", kind: "PF" })).toEqual({ ok: false, error: "Limite de 4 contas atingido" });
    expect(createCardAccount(db, other, { name: "Nubank", kind: "PF" })).toEqual({ ok: true });
  });

  test("renomear e trocar o tipo mantém o id e o histórico das compras", () => {
    const { db, u } = setup();
    ensureDefaultAccounts(db, u);
    const [pf] = listCardAccounts(db, u);
    createExpense(db, u, expense(pf.id));
    expect(updateCardAccount(db, u, pf.id, { name: "Itaú Pessoal", kind: "PJ" })).toEqual({ ok: true });
    const [row] = listInstallments(db, u, "2026-05", "2026-05");
    // A compra continua na mesma conta; a natureza dela (PF) não é reescrita.
    expect(row).toMatchObject({ accountId: pf.id, accountName: "Itaú Pessoal", nature: "PF" });
  });

  test("conta com lançamentos não pode ser excluída; a última conta também não", () => {
    const { db, u } = setup();
    ensureDefaultAccounts(db, u);
    const [pf, pj] = listCardAccounts(db, u);
    createExpense(db, u, expense(pf.id));
    expect(deleteCardAccount(db, u, pf.id)).toEqual({
      ok: false,
      error: "Esta conta tem lançamentos. Mova ou exclua os lançamentos antes de excluir a conta.",
    });
    expect(deleteCardAccount(db, u, pj.id)).toEqual({ ok: true });
    expect(deleteCardAccount(db, u, pf.id).ok).toBe(false);
  });

  test("não mexe na conta de outra pessoa", () => {
    const { db, u, other } = setup();
    ensureDefaultAccounts(db, other);
    const theirs = listCardAccounts(db, other)[0];
    expect(updateCardAccount(db, u, theirs.id, { name: "x", kind: "PF" })).toEqual({ ok: false, error: "Conta não encontrada" });
    expect(deleteCardAccount(db, u, theirs.id)).toEqual({ ok: false, error: "Conta não encontrada" });
    expect(createExpense(db, u, expense(theirs.id))).toEqual({ ok: false, error: "Conta inválida" });
  });

  test("a compra herda o tipo da conta; editar sem trocar de conta preserva a natureza antiga", async () => {
    const { db, u } = setup();
    ensureDefaultAccounts(db, u);
    const [pf, pj] = listCardAccounts(db, u);
    createExpense(db, u, expense(pj.id));
    expect(listInstallments(db, u, "2026-05", "2026-05")[0]).toMatchObject({ nature: "PJ", card: "PJ", accountName: "Cartão PJ" });
    const { updateExpense } = await import("@/lib/cards/store");
    const id = listInstallments(db, u, "2026-05", "2026-05")[0].expenseId;
    updateExpense(db, u, id, expense(pf.id));
    expect(listInstallments(db, u, "2026-05", "2026-05")[0]).toMatchObject({ nature: "PF", card: "PF", accountId: pf.id });
  });
});
