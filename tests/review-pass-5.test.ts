// Casos da revisão de Lançamentos/Transações/Resumo.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { testDb } from "./helpers/db";
import { cardExpenses, users } from "@/db/schema";
import { createCardAccount, ensureDefaultAccounts, listCardAccounts } from "@/lib/cards/accounts";
import { createExpense, listInstallments } from "@/lib/cards/store";
import { resetFiatLimits } from "@/lib/fiat/limit";
import { accountColors } from "@/components/finance/ui";

const state = vi.hoisted(() => ({ db: null as unknown, userId: 0 }));
vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: () => state.db }));
vi.mock("@/lib/auth/current", () => ({ requireUser: async () => ({ id: state.userId }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { saveTransactionAction } from "@/app/(app)/lancamentos/transaction-actions";
import { saveExpenseAction } from "@/app/(app)/lancamentos/actions";

type Db = ReturnType<typeof testDb>;

beforeEach(() => {
  resetFiatLimits();
  const db = testDb();
  state.db = db;
  state.userId = db.insert(users).values({ username: "ana", passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0].id;
  ensureDefaultAccounts(db, state.userId);
});

describe("contas", () => {
  test("nome de conta repetido com outra caixa (Nubank / nubank) é recusado", () => {
    const db = state.db as Db;
    expect(createCardAccount(db, state.userId, { name: "Nubank", kind: "PF" })).toEqual({ ok: true });
    expect(createCardAccount(db, state.userId, { name: "nubank", kind: "PF" })).toEqual({ ok: false, error: "Já existe uma conta com esse nome" });
  });

  test("compra sem conta (dado antigo/corrompido) continua aparecendo, como 'Sem conta'", () => {
    const db = state.db as Db;
    const acc = listCardAccounts(db, state.userId)[0].id;
    createExpense(db, state.userId, {
      description: "Órfã",
      totalCents: 100,
      installments: 1,
      firstInvoice: "2026-05",
      purchaseDate: "2026-05-01",
      accountId: acc,
      categoryId: null,
      notes: "",
      paidNumbers: [],
    });
    db.update(cardExpenses).set({ accountId: null }).run();
    expect(listInstallments(db, state.userId, "2026-05", "2026-05")).toEqual([
      expect.objectContaining({ description: "Órfã", accountId: 0, accountName: "Sem conta" }),
    ]);
  });

  test("cor de cada conta não muda quando outra conta é excluída", () => {
    const before = accountColors([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const after = accountColors([{ id: 2 }, { id: 3 }]);
    expect(after[2]).toBe(before[2]);
    expect(after[3]).toBe(before[3]);
    // quatro contas sempre com quatro cores diferentes
    expect(new Set(Object.values(accountColors([{ id: 1 }, { id: 5 }, { id: 9 }, { id: 13 }]))).size).toBe(4);
  });
});

describe("valores máximos", () => {
  test("transação acima de R$ 1 bilhão é recusada (somas continuam exatas)", async () => {
    const f = { date: "2026-05-01", kind: "in" as const, description: "x" };
    expect(await saveTransactionAction(null, { ...f, amount: "1.000.000.001,00" })).toEqual({ ok: false, error: "Valor muito alto" });
    expect(await saveTransactionAction(null, { ...f, amount: "1.000.000.000,00" })).toEqual({ ok: true });
  });

  test("compra acima de R$ 1 bilhão é recusada", async () => {
    const r = await saveExpenseAction(null, {
      description: "x",
      amount: "1.000.000.001,00",
      mode: "total",
      current: 1,
      total: 1,
      refMonth: "2026-05",
      purchaseDate: "2026-05-01",
      accountId: listCardAccounts(state.db as Db, state.userId)[0].id,
      categoryId: null,
      currentPaid: false,
      notes: "",
    });
    expect(r).toEqual({ ok: false, error: "Valor muito alto" });
  });
});
