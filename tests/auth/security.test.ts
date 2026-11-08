import { beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../helpers/db";
import { sessions, users } from "@/db/schema";
import { createSession } from "@/lib/auth/sessions";
import { graceMs, heartbeatMs, isIdleLocked, sessionState, setLockMinutes, touchSession } from "@/lib/auth/lock";
import { UNLOCK_MAX_FAILURES, attemptUnlock, resetUnlockLimits } from "@/lib/auth/unlock";
import { hashPassword } from "@/lib/auth/password";
import { attemptLogin } from "@/lib/auth/login";
import { resetIpLimits } from "@/lib/auth/ip-limit";
import { base32Decode, base32Encode, codeAt, confirmTotp, startTotp, verifyCode } from "@/lib/auth/totp";
import { sameOrigin } from "@/lib/auth/same-origin";

const MIN = 60_000;

async function setup(password = "senha-certa-123") {
  const db = testDb();
  const [u] = db
    .insert(users)
    .values({ username: "pedro", passwordHash: await hashPassword(password), isAdmin: false, createdAt: new Date() })
    .returning()
    .all();
  return { db, u };
}

beforeEach(() => {
  resetIpLimits();
  resetUnlockLimits();
});

describe("bloqueio por inatividade (servidor)", () => {
  test("tempos: aviso a cada ≤ 30 s e folga do servidor maior que o aviso", () => {
    expect(heartbeatMs(1)).toBe(15_000);
    expect(heartbeatMs(10)).toBe(30_000);
    expect(graceMs(10)).toBe(45_000);
    const t0 = new Date("2026-01-01T00:00:00Z");
    expect(isIdleLocked(t0, 10, new Date(t0.getTime() + 10 * MIN))).toBe(false);
    expect(isIdleLocked(t0, 10, new Date(t0.getTime() + 10 * MIN + 46_000))).toBe(true);
  });

  test("sessão sem uso fica bloqueada; o aviso de atividade não desbloqueia; só a senha desbloqueia", async () => {
    const { db, u } = await setup();
    const t0 = new Date("2026-01-01T00:00:00Z");
    const { token } = createSession(db, u.id, t0);
    expect(sessionState(db, token, new Date(t0.getTime() + 5 * MIN))?.locked).toBe(false);
    // Uso real aos 5 min renova.
    expect(touchSession(db, token, new Date(t0.getTime() + 5 * MIN))).toEqual({ ok: true });
    expect(sessionState(db, token, new Date(t0.getTime() + 14 * MIN))?.locked).toBe(false);
    const late = new Date(t0.getTime() + 20 * MIN);
    expect(sessionState(db, token, late)?.locked).toBe(true);
    // Bloqueada: aviso de atividade não renova.
    expect(touchSession(db, token, late)).toEqual({ ok: false, locked: true });
    expect(sessionState(db, token, late)?.locked).toBe(true);
    // Senha errada: continua bloqueada. Certa: libera.
    expect(await attemptUnlock(db, token, "errada", late)).toEqual({ ok: false, reason: "invalid" });
    expect(sessionState(db, token, late)?.locked).toBe(true);
    expect(await attemptUnlock(db, token, "senha-certa-123", late)).toEqual({ ok: true });
    expect(sessionState(db, token, late)?.locked).toBe(false);
  });

  test("tempo escolhido pela pessoa (só 1, 5, 10, 15 ou 30 min)", async () => {
    const { db, u } = await setup();
    expect(setLockMinutes(db, u.id, 1)).toBe(true);
    expect(setLockMinutes(db, u.id, 7)).toBe(false);
    expect(setLockMinutes(db, u.id, "30")).toBe(false);
    const t0 = new Date("2026-01-01T00:00:00Z");
    const { token } = createSession(db, u.id, t0);
    expect(sessionState(db, token, new Date(t0.getTime() + 2 * MIN))?.locked).toBe(true);
  });

  test(`${UNLOCK_MAX_FAILURES} senhas erradas no desbloqueio encerram a sessão (exige login completo)`, async () => {
    const { db, u } = await setup();
    const t0 = new Date("2026-01-01T00:00:00Z");
    const { token } = createSession(db, u.id, t0);
    const late = new Date(t0.getTime() + 60 * MIN);
    for (let i = 0; i < UNLOCK_MAX_FAILURES - 1; i++) expect((await attemptUnlock(db, token, "x", late)).ok).toBe(false);
    expect(await attemptUnlock(db, token, "x", late)).toEqual({ ok: false, reason: "expired" });
    expect(db.select().from(sessions).all()).toHaveLength(0);
    expect(await attemptUnlock(db, token, "senha-certa-123", late)).toEqual({ ok: false, reason: "expired" });
  });

  test("sessões antigas (sem registro de atividade) começam a contar no primeiro acesso", async () => {
    const { db, u } = await setup();
    const t0 = new Date("2026-01-01T00:00:00Z");
    const { token } = createSession(db, u.id, t0);
    db.update(sessions).set({ lastActiveAt: null }).run();
    const t1 = new Date(t0.getTime() + 3 * 60 * MIN);
    expect(sessionState(db, token, t1)?.locked).toBe(false);
    expect(db.select().from(sessions).get()?.lastActiveAt?.getTime()).toBe(t1.getTime());
  });
});

describe("verificação em duas etapas (TOTP)", () => {
  test("base32 ida e volta; vetor oficial da RFC 6238 (SHA1)", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
    // RFC 6238, T = 59 s → 94287082 (8 dígitos); com 6 dígitos: 287082.
    expect(codeAt(secret, Math.floor(59 / 30))).toBe("287082");
    // T = 1111111109 → 07081804 → 081804.
    expect(codeAt(secret, Math.floor(1111111109 / 30))).toBe("081804");
  });

  test("aceita ±1 intervalo; o mesmo código não vale duas vezes", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    const now = 1111111109_000;
    const step = Math.floor(now / 30_000);
    expect(verifyCode(secret, codeAt(secret, step), now)).toBe(step);
    expect(verifyCode(secret, codeAt(secret, step - 1), now)).toBe(step - 1);
    expect(verifyCode(secret, codeAt(secret, step - 3), now)).toBeNull();
    expect(verifyCode(secret, codeAt(secret, step), now, step)).toBeNull();
    expect(verifyCode(secret, "abc", now)).toBeNull();
  });

  test("login: sem código pede; código errado falha; certo entra; conta sem 2FA não muda", async () => {
    const { db, u } = await setup();
    const t = new Date("2026-03-01T12:00:00Z");
    expect((await attemptLogin(db, "pedro", "senha-certa-123", t)).ok).toBe(true);
    const secret = startTotp(db, u.id);
    // Ainda não confirmada: o login continua só com senha.
    expect((await attemptLogin(db, "pedro", "senha-certa-123", t)).ok).toBe(true);
    expect(confirmTotp(db, u.id, codeAt(secret, Math.floor(t.getTime() / 30_000)), t.getTime())).toBe(true);
    expect(await attemptLogin(db, "pedro", "senha-certa-123", t)).toEqual({ ok: false, reason: "totp" });
    expect(await attemptLogin(db, "pedro", "senha-certa-123", t, null, "000000")).toEqual({ ok: false, reason: "totp_invalid" });
    const later = new Date(t.getTime() + 30_000);
    const ok = await attemptLogin(db, "pedro", "senha-certa-123", later, null, codeAt(secret, Math.floor(later.getTime() / 30_000)));
    expect(ok.ok).toBe(true);
    // Senha errada com código: continua inválido (não revela nada a mais).
    expect(await attemptLogin(db, "pedro", "errada", later, null, "123456")).toEqual({ ok: false, reason: "invalid" });
    expect(db.select({ e: users.totpEnabled }).from(users).where(eq(users.id, u.id)).get()?.e).toBe(true);
  });
});

describe("origem do pedido (CSRF)", () => {
  const req = (h: Record<string, string>) => new Request("http://x/api/session/heartbeat", { method: "POST", headers: h });
  test("aceita o próprio site; recusa outro site", () => {
    expect(sameOrigin(req({ origin: "https://painel.exemplo.com", host: "painel.exemplo.com" }))).toBe(true);
    expect(sameOrigin(req({ origin: "https://malicioso.com", host: "painel.exemplo.com" }))).toBe(false);
    expect(sameOrigin(req({ "sec-fetch-site": "cross-site", host: "painel.exemplo.com" }))).toBe(false);
    expect(sameOrigin(req({ "sec-fetch-site": "same-origin", host: "painel.exemplo.com" }))).toBe(true);
    expect(sameOrigin(req({ origin: "lixo", host: "painel.exemplo.com" }))).toBe(false);
  });
});

describe("bloqueio por inatividade desativado (opção da pessoa)", () => {
  test("0 = desativado: aceito e nunca bloqueia; outros valores fora da lista continuam recusados", async () => {
    const { db, u } = await setup();
    expect(setLockMinutes(db, u.id, 0)).toBe(true);
    expect(setLockMinutes(db, u.id, -1)).toBe(false);
    const t0 = new Date("2026-01-01T00:00:00Z");
    const { token } = createSession(db, u.id, t0);
    expect(sessionState(db, token, new Date(t0.getTime() + 6 * 24 * 60 * MIN))?.locked).toBe(false);
    expect(isIdleLocked(t0, 0, new Date(t0.getTime() + 365 * 24 * 60 * MIN))).toBe(false);
  });
});
