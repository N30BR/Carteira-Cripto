import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../helpers/db";
import { fiatBalances, users } from "@/db/schema";
import {
  MAX_ACCOUNTS,
  createAccount,
  deleteAccount,
  listAccounts,
  listBalances,
  renameAccount,
  setBalance,
} from "@/lib/fiat/accounts";

function setup() {
  const db = testDb();
  const mk = (username: string) =>
    db.insert(users).values({ username, passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0].id;
  return { db, a: mk("ana"), b: mk("bia") };
}

describe("contas fiduciárias", () => {
  test("cria conta com saldo inicial e lista com o último saldo", () => {
    const { db, a } = setup();
    expect(createAccount(db, a, { name: "Conta PF", amount: "1000.00", date: "2026-10-01" })).toEqual({ ok: true });
    const [acc] = listAccounts(db, a);
    expect(setBalance(db, a, acc.id, { amount: "1500.50", date: "2026-11-01" })).toEqual({ ok: true });
    expect(listAccounts(db, a)).toEqual([{ id: acc.id, name: "Conta PF", amount: "1500.50", date: "2026-11-01" }]);
    expect(listBalances(db, a)[acc.id]).toEqual([
      { date: "2026-10-01", amount: "1000.00" },
      { date: "2026-11-01", amount: "1500.50" },
    ]);
  });

  test("registrar duas vezes no mesmo dia substitui o valor", () => {
    const { db, a } = setup();
    createAccount(db, a, { name: "PJ", amount: "10.00", date: "2026-11-05" });
    const [acc] = listAccounts(db, a);
    setBalance(db, a, acc.id, { amount: "20.00", date: "2026-11-05" });
    expect(db.select().from(fiatBalances).where(eq(fiatBalances.accountId, acc.id)).all()).toHaveLength(1);
    expect(listAccounts(db, a)[0].amount).toBe("20.00");
  });

  test("nome repetido para a mesma pessoa é recusado; outra pessoa pode usar", () => {
    const { db, a, b } = setup();
    createAccount(db, a, { name: "Caixinha", amount: "1.00", date: "2026-11-05" });
    expect(createAccount(db, a, { name: "Caixinha", amount: "1.00", date: "2026-11-05" })).toEqual({
      ok: false,
      error: "Você já tem uma conta com esse nome",
    });
    expect(createAccount(db, b, { name: "Caixinha", amount: "1.00", date: "2026-11-05" })).toEqual({ ok: true });
  });

  test("limite de contas por pessoa", () => {
    const { db, a } = setup();
    for (let i = 0; i < MAX_ACCOUNTS; i++) createAccount(db, a, { name: `C${i}`, amount: "1.00", date: "2026-11-05" });
    expect(createAccount(db, a, { name: "Extra", amount: "1.00", date: "2026-11-05" })).toEqual({
      ok: false,
      error: `Limite de ${MAX_ACCOUNTS} contas atingido`,
    });
  });

  test("ninguém mexe na conta de outra pessoa", () => {
    const { db, a, b } = setup();
    createAccount(db, a, { name: "PF", amount: "100.00", date: "2026-11-05" });
    const id = listAccounts(db, a)[0].id;
    const notFound = { ok: false, error: "Conta não encontrada" };
    expect(setBalance(db, b, id, { amount: "0.00", date: "2026-11-05" })).toEqual(notFound);
    expect(renameAccount(db, b, id, "Hack")).toEqual(notFound);
    expect(deleteAccount(db, b, id)).toEqual(notFound);
    expect(listAccounts(db, b)).toEqual([]);
    expect(listBalances(db, b)).toEqual({});
    expect(listAccounts(db, a)[0]).toMatchObject({ name: "PF", amount: "100.00" });
  });

  test("renomear e remover (remove o histórico junto)", () => {
    const { db, a } = setup();
    createAccount(db, a, { name: "PF", amount: "100.00", date: "2026-11-05" });
    createAccount(db, a, { name: "PJ", amount: "1.00", date: "2026-11-05" });
    const [pf, pj] = listAccounts(db, a);
    expect(renameAccount(db, a, pf.id, "PJ")).toEqual({ ok: false, error: "Você já tem uma conta com esse nome" });
    expect(renameAccount(db, a, pf.id, "Pessoal")).toEqual({ ok: true });
    expect(deleteAccount(db, a, pj.id)).toEqual({ ok: true });
    expect(listAccounts(db, a).map((x) => x.name)).toEqual(["Pessoal"]);
    expect(db.select().from(fiatBalances).where(eq(fiatBalances.accountId, pj.id)).all()).toEqual([]);
  });
});
