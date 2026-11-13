import { describe, expect, test } from "vitest";
import { testDb } from "../helpers/db";
import { accountMovements, cardInstallments, users } from "@/db/schema";
import { createAccount, listAccounts } from "@/lib/fiat/accounts";
import { createTransaction, listTransactions } from "@/lib/transactions/store";
import { ensureDefaultAccounts, listCardAccounts } from "@/lib/cards/accounts";
import { createCategory, listCategories } from "@/lib/cards/categories";
import { countAllExpenses, createExpense, deleteAllExpenses, listInstallments, setInstallmentPaid, setInstallmentSettled, type ExpenseInput } from "@/lib/cards/store";

function setup() {
  const db = testDb();
  const mk = (username: string) =>
    db.insert(users).values({ username, passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0].id;
  const u = mk("ana");
  const other = mk("bia");
  ensureDefaultAccounts(db, u);
  ensureDefaultAccounts(db, other);
  return { db, u, other };
}

const exp = (accountId: number, o: Partial<ExpenseInput> = {}): ExpenseInput => ({
  description: "Compra",
  totalCents: 40000,
  installments: 4,
  firstInvoice: "2026-11",
  purchaseDate: "2026-11-01",
  accountId,
  categoryId: null,
  notes: "",
  paidNumbers: [],
  ...o,
});

const balanceOf = (db: ReturnType<typeof testDb>, u: number, name: string) => listAccounts(db, u).find((a) => a.name === name)?.amount;

describe("Excluir todas as faturas", () => {
  test("apaga pagas, pendentes, quitadas, passadas e futuras, PF e PJ — de todos os meses", () => {
    const { db, u } = setup();
    const [pf, pj] = listCardAccounts(db, u);
    createExpense(db, u, exp(pf.id, { firstInvoice: "2024-01", purchaseDate: "2023-12-20", paidNumbers: [1, 2] }), "2026-11-01");
    createExpense(db, u, exp(pj.id, { firstInvoice: "2027-06", installments: 12, totalCents: 120000 }), "2026-11-01");
    createExpense(db, u, exp(pj.id), "2026-11-01");
    const [nov] = listInstallments(db, u, "2026-11", "2026-11");
    setInstallmentSettled(db, u, nov.installmentId, true);
    expect(countAllExpenses(db, u)).toEqual({ expenses: 3, installments: 20 });

    expect(deleteAllExpenses(db, u)).toEqual({ ok: true, expenses: 3, installments: 20 });
    expect(countAllExpenses(db, u)).toEqual({ expenses: 0, installments: 0 });
    expect(listInstallments(db, u, "2000-01", "2099-12")).toEqual([]);
    expect(db.select().from(cardInstallments).all()).toEqual([]);
  });

  test("preserva cartões, categorias, transações e contas; estorna o desconto das parcelas pagas", () => {
    const { db, u } = setup();
    const card = listCardAccounts(db, u)[0];
    createAccount(db, u, { name: card.name, amount: "1000.00", date: "2026-10-01" });
    createCategory(db, u, "Viagem");
    createTransaction(db, u, { date: "2026-11-02", kind: "out", description: "Mercado", amountCents: 5000, accountId: listAccounts(db, u)[0].id });
    createExpense(db, u, exp(card.id), "2026-11-01");
    const [p1] = listInstallments(db, u, "2026-11", "2026-11");
    setInstallmentPaid(db, u, p1.installmentId, true, "2026-11-10");
    expect(balanceOf(db, u, card.name)).toBe("850.00"); // -50 (transação) -100 (parcela)

    const cardsBefore = listCardAccounts(db, u);
    const catsBefore = listCategories(db, u);
    deleteAllExpenses(db, u);
    expect(listCardAccounts(db, u)).toEqual(cardsBefore);
    expect(listCategories(db, u)).toEqual(catsBefore);
    expect(listTransactions(db, u, "2026-11-01", "2026-11-30")).toHaveLength(1);
    // Só a movimentação da parcela sai; a da transação fica.
    expect(db.select().from(accountMovements).all().map((m) => m.source)).toEqual(["tx"]);
    expect(balanceOf(db, u, card.name)).toBe("950.00");
  });

  test("não toca nas faturas de outra pessoa", () => {
    const { db, u, other } = setup();
    createExpense(db, u, exp(listCardAccounts(db, u)[0].id), "2026-11-01");
    const theirCard = listCardAccounts(db, other)[1];
    createAccount(db, other, { name: theirCard.name, amount: "500.00", date: "2026-10-01" });
    createExpense(db, other, exp(theirCard.id), "2026-11-01");
    const [theirs] = listInstallments(db, other, "2026-11", "2026-11");
    setInstallmentPaid(db, other, theirs.installmentId, true, "2026-11-10");

    deleteAllExpenses(db, u);
    expect(countAllExpenses(db, other)).toEqual({ expenses: 1, installments: 4 });
    expect(balanceOf(db, other, theirCard.name)).toBe("400.00");
  });

  test("sem faturas: não faz nada", () => {
    const { db, u } = setup();
    expect(deleteAllExpenses(db, u)).toEqual({ ok: true, expenses: 0, installments: 0 });
  });

  test("erro no meio: nada é excluído (transação desfeita)", () => {
    const { db, u } = setup();
    createExpense(db, u, exp(listCardAccounts(db, u)[0].id, { paidNumbers: [1] }), "2026-11-01");
    const before = countAllExpenses(db, u);
    // Simula falha do banco durante a exclusão: a tabela de parcelas some no meio da transação.
    const broken = new Proxy(db, {
      get(t, k) {
        if (k === "transaction")
          return (fn: (tx: unknown) => unknown) =>
            t.transaction((tx) => {
              const r = fn(
                new Proxy(tx, {
                  get(x, kk) {
                    if (kk === "delete")
                      return (table: unknown) => {
                        if (table === cardInstallments) throw new Error("falha simulada");
                        return x.delete(table as typeof cardInstallments);
                      };
                    return Reflect.get(x, kk);
                  },
                }),
              );
              return r;
            });
        return Reflect.get(t, k);
      },
    });
    expect(() => deleteAllExpenses(broken, u)).toThrow("falha simulada");
    expect(countAllExpenses(db, u)).toEqual(before);
    expect(db.select().from(accountMovements).all()).toHaveLength(1);
  });
});
