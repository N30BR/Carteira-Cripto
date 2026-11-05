import { beforeEach, describe, expect, test, vi } from "vitest";
import { testDb } from "../helpers/db";
import { users } from "@/db/schema";
import { listTransactions } from "@/lib/transactions/store";
import { resetFiatLimits } from "@/lib/fiat/limit";

const state = vi.hoisted(() => ({ db: null as unknown, userId: 0 }));
vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: () => state.db }));
vi.mock("@/lib/auth/current", () => ({ requireUser: async () => ({ id: state.userId }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { deleteTransactionAction, saveTransactionAction, type TransactionForm } from "@/app/(app)/lancamentos/transaction-actions";

type Db = Parameters<typeof listTransactions>[0];
let other = 0;
const mine = () => listTransactions(state.db as Db, state.userId, "2000-01-01", "2099-12-31");
const form = (o: Partial<TransactionForm> = {}): TransactionForm => ({
  date: "2025-05-10",
  kind: "in",
  description: "Recebimento de serviço",
  amount: "2.500,00",
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
});

describe("ações de transações", () => {
  test("lança entrada e saída com valor positivo e o tipo guardado", async () => {
    expect(await saveTransactionAction(null, form())).toEqual({ ok: true });
    expect(await saveTransactionAction(null, form({ kind: "out", date: "2025-05-08", description: "Fornecedor", amount: "780" }))).toEqual({ ok: true });
    expect(mine()).toEqual([
      expect.objectContaining({ date: "2025-05-10", kind: "in", amountCents: 250000, description: "Recebimento de serviço" }),
      expect.objectContaining({ date: "2025-05-08", kind: "out", amountCents: 78000 }),
    ]);
  });

  test("valida data, tipo, descrição e valor", async () => {
    const bad = async (o: Partial<TransactionForm>) => (await saveTransactionAction(null, form(o))).ok;
    expect(await saveTransactionAction(null, form({ kind: undefined as unknown as "in" }))).toEqual({ ok: false, error: "Escolha Entrada ou Saída" });
    expect(await bad({ kind: "hack" as "in" })).toBe(false);
    expect(await saveTransactionAction(null, form({ date: "2025-02-30" }))).toEqual({ ok: false, error: "Data inválida" });
    expect(await bad({ date: "1999-12-31" })).toBe(false);
    expect(await bad({ date: "2100-01-01" })).toBe(false);
    expect(await bad({ date: "10/05/2025" })).toBe(false);
    expect(await bad({ description: "   " })).toBe(false);
    expect(await bad({ description: "a‮b" })).toBe(false);
    expect(await bad({ description: "x".repeat(81) })).toBe(false);
    expect(await saveTransactionAction(null, form({ amount: "0" }))).toEqual({ ok: false, error: "Informe um valor maior que zero" });
    expect(await bad({ amount: "-5" })).toBe(false);
    expect(await bad({ amount: "abc" })).toBe(false);
    expect(await bad({ amount: "99999999999999" })).toBe(false);
    expect(await saveTransactionAction(null, "x" as unknown as TransactionForm)).toEqual({ ok: false, error: "Dados inválidos" });
    expect(mine()).toEqual([]);
  });

  test("edita e exclui só as próprias; ids inválidos recusados", async () => {
    await saveTransactionAction(null, form());
    const id = mine()[0].id;
    expect(await saveTransactionAction(id, form({ kind: "out", amount: "10,50" }))).toEqual({ ok: true });
    expect(mine()[0]).toMatchObject({ kind: "out", amountCents: 1050 });

    state.userId = other;
    const nf = { ok: false, error: "Transação não encontrada" };
    expect(await saveTransactionAction(id, form())).toEqual(nf);
    expect(await deleteTransactionAction(id)).toEqual(nf);
    expect(await deleteTransactionAction("1" as unknown as number)).toEqual(nf);
    expect(await saveTransactionAction(1.5, form())).toEqual(nf);

    state.userId = (state.db as Db).select().from(users).all()[0].id;
    expect(await deleteTransactionAction(id)).toEqual({ ok: true });
    expect(mine()).toEqual([]);
  });

  test("limite de alterações por minuto", async () => {
    for (let i = 0; i < 60; i++) await saveTransactionAction(null, form());
    expect(await saveTransactionAction(null, form())).toEqual({ ok: false, error: "Muitas alterações seguidas. Aguarde um minuto." });
  });
});
