import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../helpers/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { LOCK_MS, attemptLogin } from "@/lib/auth/login";

async function setup() {
  const db = testDb();
  db.insert(users)
    .values({ username: "pedro", passwordHash: await hashPassword("senha-certa"), isAdmin: false, createdAt: new Date() })
    .run();
  const user = () => db.select().from(users).where(eq(users.username, "pedro")).get()!;
  return { db, user };
}

const t0 = new Date("2026-01-01T00:00:00Z");

describe("attemptLogin", () => {
  test("senha certa cria sessão", async () => {
    const { db } = await setup();
    const r = await attemptLogin(db, "pedro", "senha-certa", t0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.token).toMatch(/^[0-9a-f]{64}$/);
  });

  test("username com espaços e maiúsculas funciona", async () => {
    const { db } = await setup();
    expect((await attemptLogin(db, " PEDRO ", "senha-certa", t0)).ok).toBe(true);
  });

  test("senha errada e usuário inexistente falham do mesmo jeito", async () => {
    const { db } = await setup();
    expect(await attemptLogin(db, "pedro", "errada", t0)).toEqual({ ok: false });
    expect(await attemptLogin(db, "ninguem", "errada", t0)).toEqual({ ok: false });
  });

  test("5 erros bloqueiam; senha certa durante o bloqueio falha e não conta", async () => {
    const { db, user } = await setup();
    for (let i = 0; i < 5; i++) await attemptLogin(db, "pedro", "errada", t0);
    expect(user().lockedUntil?.getTime()).toBe(t0.getTime() + LOCK_MS);
    const before = user().failedAttempts;
    expect(await attemptLogin(db, "pedro", "senha-certa", t0)).toEqual({ ok: false });
    expect(user().failedAttempts).toBe(before);
  });

  test("depois do bloqueio, senha certa entra e zera o contador", async () => {
    const { db, user } = await setup();
    for (let i = 0; i < 5; i++) await attemptLogin(db, "pedro", "errada", t0);
    const later = new Date(t0.getTime() + LOCK_MS + 1);
    expect((await attemptLogin(db, "pedro", "senha-certa", later)).ok).toBe(true);
    expect(user().failedAttempts).toBe(0);
    expect(user().lockedUntil).toBeNull();
  });

  test("acerto no meio zera o contador", async () => {
    const { db, user } = await setup();
    for (let i = 0; i < 4; i++) await attemptLogin(db, "pedro", "errada", t0);
    await attemptLogin(db, "pedro", "senha-certa", t0);
    for (let i = 0; i < 4; i++) await attemptLogin(db, "pedro", "errada", t0);
    expect(user().lockedUntil).toBeNull();
    expect((await attemptLogin(db, "pedro", "senha-certa", t0)).ok).toBe(true);
  });
});
