import { beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../helpers/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { ACCOUNT_MAX_FAILURES, LOCK_MS, attemptLogin } from "@/lib/auth/login";
import { resetIpLimits } from "@/lib/auth/ip-limit";

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
  beforeEach(() => resetIpLimits());

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
    expect(await attemptLogin(db, "pedro", "errada", t0)).toEqual({ ok: false, reason: "invalid" });
    expect(await attemptLogin(db, "ninguem", "errada", t0)).toEqual({ ok: false, reason: "invalid" });
  });

  test("5 erros do mesmo IP bloqueiam esse IP nessa conta; senha certa dali falha e não conta", async () => {
    const { db, user } = await setup();
    for (let i = 0; i < 5; i++) await attemptLogin(db, "pedro", "errada", t0, "6.6.6.6");
    const before = user().failedAttempts;
    expect(await attemptLogin(db, "pedro", "senha-certa", t0, "6.6.6.6")).toEqual({ ok: false, reason: "invalid" });
    expect(user().failedAttempts).toBe(before);
  });

  test("quem erra a senha de outra pessoa não a tranca para fora (outro IP entra)", async () => {
    const { db, user } = await setup();
    for (let i = 0; i < 5; i++) await attemptLogin(db, "pedro", "errada", t0, "6.6.6.6");
    expect(user().lockedUntil).toBeNull();
    expect((await attemptLogin(db, "pedro", "senha-certa", t0, "1.2.3.4")).ok).toBe(true);
  });

  test("muitos erros de vários IPs bloqueiam a conta inteira por 15 min", async () => {
    const { db, user } = await setup();
    for (let i = 0; i < ACCOUNT_MAX_FAILURES; i++) await attemptLogin(db, "pedro", "errada", t0, `10.0.0.${Math.floor(i / 5)}`);
    expect(user().lockedUntil?.getTime()).toBe(t0.getTime() + LOCK_MS);
    expect(await attemptLogin(db, "pedro", "senha-certa", t0, "1.2.3.4")).toEqual({ ok: false, reason: "invalid" });
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

describe("tentativas simultâneas", () => {
  beforeEach(() => resetIpLimits());

  test("não furam o bloqueio: 5 erros e a senha certa juntos → a certa é recusada", async () => {
    const { db } = await setup();
    const tries = [...Array(5)].map(() => attemptLogin(db, "pedro", "errada", t0));
    tries.push(attemptLogin(db, "pedro", "senha-certa", t0));
    const results = await Promise.all(tries);
    expect(results[5]).toEqual({ ok: false, reason: "invalid" });
  });

  test("não furam o limite por IP: 21 falhas juntas do mesmo IP → a última é barrada", async () => {
    const { db } = await setup();
    const results = await Promise.all(
      [...Array(21)].map((_, i) => attemptLogin(db, `ninguem${i}`, "x", t0, "9.9.9.9")),
    );
    expect(results[20]).toEqual({ ok: false, reason: "ip" });
  });

  test("IP limitado não chega a testar a senha", async () => {
    const { db } = await setup();
    for (let i = 0; i < 20; i++) await attemptLogin(db, "ninguem", "x", t0, "8.8.8.8");
    expect(await attemptLogin(db, "pedro", "senha-certa", t0, "8.8.8.8")).toEqual({ ok: false, reason: "ip" });
    expect((await attemptLogin(db, "pedro", "senha-certa", t0, "7.7.7.7")).ok).toBe(true);
  });
});
