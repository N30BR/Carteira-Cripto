import { beforeEach, describe, expect, test, vi } from "vitest";
import { resetIpLimits } from "@/lib/auth/ip-limit";
import { eq } from "drizzle-orm";
import { testDb } from "../helpers/db";
import { sessions, users } from "@/db/schema";
import { createSession, hashToken } from "@/lib/auth/sessions";
import { attemptLogin, LOCK_MS } from "@/lib/auth/login";
import {
  changeOwnPassword,
  createUser,
  deleteUser,
  ensureBootstrapAdmin,
  listUsers,
  resetPassword,
  unlockUser,
} from "@/lib/admin/users";

const t0 = new Date("2026-01-01T00:00:00Z");

async function mk(db: ReturnType<typeof testDb>, username: string, isAdmin = false, password = "senha-certa") {
  const r = await createUser(db, { username, password, isAdmin });
  expect(r).toEqual({ ok: true });
  return db.select().from(users).where(eq(users.username, username)).get()!;
}

beforeEach(() => resetIpLimits());

describe("createUser", () => {
  test("username duplicado com caixa diferente é recusado", async () => {
    const db = testDb();
    await mk(db, "pedro");
    expect(await createUser(db, { username: "PEDRO", password: "senha-certa", isAdmin: false })).toEqual({
      ok: false,
      error: "Usuário já existe",
    });
  });

  test("valida username e senha", async () => {
    const db = testDb();
    expect((await createUser(db, { username: "ab", password: "senha-certa", isAdmin: false })).ok).toBe(false);
    expect(await createUser(db, { username: "pedro", password: "curta", isAdmin: false })).toEqual({
      ok: false,
      error: "A senha precisa ter entre 8 e 256 caracteres",
    });
  });

  test("listUsers mostra os usuários sem o hash", async () => {
    const db = testDb();
    await mk(db, "pedro", true);
    const list = listUsers(db);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ username: "pedro", isAdmin: true, lockedUntil: null });
    expect(list[0]).not.toHaveProperty("passwordHash");
  });
});

describe("resetPassword e unlockUser", () => {
  test("resetPassword troca a senha, desbloqueia e encerra sessões", async () => {
    const db = testDb();
    const u = await mk(db, "pedro");
    createSession(db, u.id);
    for (let i = 0; i < 5; i++) await attemptLogin(db, "pedro", "errada", t0);
    expect(await resetPassword(db, u.id, "nova-senha-123")).toEqual({ ok: true });
    expect(db.select().from(sessions).all()).toHaveLength(0);
    expect((await attemptLogin(db, "pedro", "nova-senha-123", t0)).ok).toBe(true);
  });

  test("unlockUser libera conta bloqueada", async () => {
    const db = testDb();
    const u = await mk(db, "pedro");
    for (let i = 0; i < 5; i++) await attemptLogin(db, "pedro", "errada", t0);
    expect((await attemptLogin(db, "pedro", "senha-certa", t0)).ok).toBe(false);
    expect(unlockUser(db, u.id)).toEqual({ ok: true });
    expect((await attemptLogin(db, "pedro", "senha-certa", t0)).ok).toBe(true);
  });
});

describe("deleteUser", () => {
  test("admin remove outro admin, mas não a si mesmo", async () => {
    const db = testDb();
    const a = await mk(db, "admin-a", true);
    const b = await mk(db, "admin-b", true);
    expect(deleteUser(db, a.id, a.id)).toEqual({ ok: false, error: "Você não pode remover a si mesmo" });
    expect(deleteUser(db, a.id, b.id)).toEqual({ ok: true });
  });

  test("não remove o último administrador", async () => {
    const db = testDb();
    const a = await mk(db, "admin-a", true);
    const c = await mk(db, "comum");
    expect(deleteUser(db, c.id, a.id)).toEqual({ ok: false, error: "Não é possível remover o último administrador" });
    expect(deleteUser(db, a.id, c.id)).toEqual({ ok: true });
  });
});

describe("changeOwnPassword", () => {
  test("senha atual errada conta como falha e bloqueia depois de 5", async () => {
    const db = testDb();
    const u = await mk(db, "pedro");
    const { token } = createSession(db, u.id, t0);
    for (let i = 0; i < 5; i++) {
      expect(await changeOwnPassword(db, u.id, hashToken(token), "errada", "nova-senha-123", t0)).toEqual({
        ok: false,
        error: "Senha atual incorreta",
      });
    }
    expect(await changeOwnPassword(db, u.id, hashToken(token), "senha-certa", "nova-senha-123", t0)).toEqual({
      ok: false,
      error: "Muitas tentativas. Tente novamente em 15 minutos.",
    });
    const later = new Date(t0.getTime() + LOCK_MS + 1);
    expect((await changeOwnPassword(db, u.id, hashToken(token), "senha-certa", "nova-senha-123", later)).ok).toBe(true);
  });

  test("troca a senha e mantém só a sessão atual", async () => {
    const db = testDb();
    const u = await mk(db, "pedro");
    const keep = createSession(db, u.id).token;
    createSession(db, u.id);
    expect(await changeOwnPassword(db, u.id, hashToken(keep), "senha-certa", "nova-senha-123")).toEqual({ ok: true });
    expect(db.select().from(sessions).all().map((s) => s.idHash)).toEqual([hashToken(keep)]);
    expect((await attemptLogin(db, "pedro", "nova-senha-123")).ok).toBe(true);
  });

  test("valida a nova senha", async () => {
    const db = testDb();
    const u = await mk(db, "pedro");
    expect((await changeOwnPassword(db, u.id, "h", "senha-certa", "curta")).ok).toBe(false);
  });
});

describe("ensureBootstrapAdmin", () => {
  test("cria o admin quando o banco está vazio e as variáveis existem", async () => {
    const db = testDb();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await ensureBootstrapAdmin(db, { ADMIN_USERNAME: "Admin", ADMIN_PASSWORD: "senha-forte-123" })).toBe("created");
    expect(log).toHaveBeenCalledWith("Administrador inicial criado: admin");
    expect(listUsers(db)[0]).toMatchObject({ username: "admin", isAdmin: true });
    log.mockRestore();
  });

  test("não faz nada se já existe usuário", async () => {
    const db = testDb();
    await mk(db, "pedro");
    expect(await ensureBootstrapAdmin(db, { ADMIN_USERNAME: "admin", ADMIN_PASSWORD: "senha-forte-123" })).toBe("skipped");
    expect(listUsers(db)).toHaveLength(1);
  });

  test("não faz nada sem as variáveis", async () => {
    const db = testDb();
    expect(await ensureBootstrapAdmin(db, {})).toBe("skipped");
    expect(listUsers(db)).toHaveLength(0);
  });
});
