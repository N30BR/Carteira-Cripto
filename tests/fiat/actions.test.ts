import { beforeEach, describe, expect, test, vi } from "vitest";
import { testDb } from "../helpers/db";
import { users } from "@/db/schema";
import { createAccount, listAccounts } from "@/lib/fiat/accounts";

const state = vi.hoisted(() => ({ db: null as unknown, userId: 0 }));
vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: () => state.db }));
vi.mock("@/lib/auth/current", () => ({ requireUser: async () => ({ id: state.userId }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import {
  createAccountAction,
  deleteAccountAction,
  renameAccountAction,
  setBalanceAction,
} from "@/app/(app)/ativos/fiat-actions";
import { resetFiatLimits } from "@/lib/fiat/limit";

type Db = Parameters<typeof listAccounts>[0];
let other = 0;

beforeEach(() => {
  resetFiatLimits();
  const db = testDb();
  state.db = db;
  const mk = (username: string) =>
    db.insert(users).values({ username, passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0].id;
  state.userId = mk("ana");
  other = mk("bia");
});

describe("actions fiduciárias", () => {
  test("cria conta a partir do texto digitado", async () => {
    expect(await createAccountAction("  Conta PF ", "5.230,50", "2026-01-10")).toEqual({ ok: true });
    expect(listAccounts(state.db as Db, state.userId)).toEqual([
      expect.objectContaining({ name: "Conta PF", amount: "5230.50", date: "2026-01-10" }),
    ]);
  });

  test("valida valor, nome e data", async () => {
    expect(await createAccountAction("PF", "abc", "")).toEqual({ ok: false, error: "Valor inválido" });
    expect((await createAccountAction("", "1", "")).ok).toBe(false);
    expect(await createAccountAction("PF", "1", "2999-01-01")).toEqual({ ok: false, error: "A data não pode ser no futuro" });
  });

  test("recusa ids inválidos e contas de outra pessoa", async () => {
    createAccount(state.db as Db, other, { name: "Dela", amount: "10.00", date: "2026-01-01" });
    const herId = listAccounts(state.db as Db, other)[0].id;
    const notFound = { ok: false, error: "Conta não encontrada" };
    expect(await setBalanceAction(herId, "0", "")).toEqual(notFound);
    expect(await renameAccountAction(herId, "Minha")).toEqual(notFound);
    expect(await deleteAccountAction(herId)).toEqual(notFound);
    expect(await setBalanceAction("1" as unknown as number, "0", "")).toEqual(notFound);
    expect(await deleteAccountAction(1.5)).toEqual(notFound);
    expect(listAccounts(state.db as Db, other)[0]).toMatchObject({ name: "Dela", amount: "10.00" });
  });

  test("atualiza, renomeia e remove a própria conta", async () => {
    await createAccountAction("PF", "100", "2026-01-01");
    const id = listAccounts(state.db as Db, state.userId)[0].id;
    expect(await setBalanceAction(id, "250,00", "2026-02-01")).toEqual({ ok: true });
    expect(await renameAccountAction(id, "Pessoal")).toEqual({ ok: true });
    expect(listAccounts(state.db as Db, state.userId)[0]).toMatchObject({ name: "Pessoal", amount: "250.00" });
    expect(await deleteAccountAction(id)).toEqual({ ok: true });
    expect(listAccounts(state.db as Db, state.userId)).toEqual([]);
  });
});

describe("limite de alterações", () => {
  test("mais de 60 alterações por minuto são recusadas", async () => {
    await createAccountAction("PF", "1", "");
    const id = listAccounts(state.db as Db, state.userId)[0].id;
    for (let i = 0; i < 59; i++) await setBalanceAction(id, "1", "");
    expect(await setBalanceAction(id, "1", "")).toEqual({ ok: false, error: "Muitas alterações seguidas. Aguarde um minuto." });
  });
});
