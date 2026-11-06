import { beforeEach, describe, expect, test, vi } from "vitest";
import { testDb } from "./helpers/db";
import { users } from "@/db/schema";
import { createAccount, listAccounts } from "@/lib/fiat/accounts";
import { getDisabledModules, setDisabledModules } from "@/lib/modules-store";

const state = vi.hoisted(() => ({ db: null as unknown, userId: 0 }));
vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: () => state.db }));
vi.mock("@/lib/auth/current", () => ({ requireUser: async () => ({ id: state.userId }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { renameAccountAction } from "@/app/(app)/ativos/fiat-actions";
import { setModulesAction } from "@/app/(app)/modules-actions";
import { resetModuleLimits } from "@/lib/auth/modules";
import { resetFiatLimits } from "@/lib/fiat/limit";

type Db = Parameters<typeof listAccounts>[0];
const db = () => state.db as Db;
let other = 0;

beforeEach(() => {
  resetFiatLimits();
  resetModuleLimits();
  state.db = testDb();
  const mk = (username: string) =>
    db().insert(users).values({ username, passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0].id;
  state.userId = mk("ana");
  other = mk("bia");
});

describe("módulo desligado bloqueia as ações no servidor, sem apagar nada", () => {
  test("R$ desligado: renomear conta é recusado (redireciona); a conta continua salva; religado funciona", async () => {
    createAccount(db(), state.userId, { name: "Banco", amount: "10.00", date: "2026-01-01" });
    const acc = listAccounts(db(), state.userId)[0];
    setDisabledModules(db(), state.userId, ["fiat"]);
    await expect(renameAccountAction(acc.id, "Outro")).rejects.toThrow(/NEXT_REDIRECT/);
    expect(listAccounts(db(), state.userId).map((a) => a.name)).toEqual(["Banco"]);
    setDisabledModules(db(), state.userId, []);
    expect((await renameAccountAction(acc.id, "Outro")).ok).toBe(true);
  });

  test("salvar a personalização: valida a lista, vale só para o próprio usuário e diz para onde ir", async () => {
    const r = await setModulesAction(["crypto", "nada", "fiat"]);
    expect(r).toEqual({ ok: true, disabled: ["crypto", "fiat"], fallback: "/faturas" });
    expect(getDisabledModules(db(), other)).toEqual([]);
  });

  test("muitas mudanças seguidas são limitadas", async () => {
    for (let i = 0; i < 30; i++) await setModulesAction([]);
    expect((await setModulesAction([])).ok).toBe(false);
  });
});
