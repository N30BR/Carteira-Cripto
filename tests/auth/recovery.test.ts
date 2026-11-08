import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../helpers/db";
import { accountTokens, securityEvents, sessions, users } from "@/db/schema";

const state = vi.hoisted(() => ({ db: null as unknown, userId: 0, username: "pedro" }));
vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: () => state.db }));
vi.mock("@/lib/auth/current", () => ({ requireUser: async () => ({ id: state.userId, username: state.username }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }) }));

import { setMailSenderForTests, type Mail } from "@/lib/mail/mailer";
import { GENERIC_RESET_MESSAGE, RESET_TTL_MS, completePasswordReset, emailStatus, passwordProblem, requestPasswordReset, resetRecoveryLimits, verifyEmailToken } from "@/lib/auth/recovery";
import { requestEmailAction, startTotpAction, confirmTotpAction, disableTotpAction } from "@/app/(app)/conta/seguranca/actions";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/sessions";
import { sessionState } from "@/lib/auth/lock";
import { attemptLogin } from "@/lib/auth/login";
import { resetIpLimits } from "@/lib/auth/ip-limit";
import { codeAt, startTotp } from "@/lib/auth/totp";
import type { Db } from "@/db/client";

const PASS = "senha-certa-123";
let outbox: Mail[] = [];
const tokenFrom = (m: Mail) => m.text.match(/#([A-Za-z0-9_-]{43})/)?.[1] ?? "";
const flush = () => new Promise((r) => setTimeout(r, 0));

async function mkUser(db: Db, username: string) {
  const [u] = db.insert(users).values({ username, passwordHash: await hashPassword(PASS), isAdmin: false, createdAt: new Date() }).returning().all();
  return u;
}

/** Cadastra e confirma o e-mail pela própria ação (com reautenticação). */
async function verifyEmail(db: Db, email: string) {
  const r = await requestEmailAction(email, PASS, "");
  expect(r.ok).toBe(true);
  await flush();
  const mail = outbox.filter((m) => m.to === email).at(-1)!;
  expect(verifyEmailToken(db, tokenFrom(mail), "203.0.113.9").ok).toBe(true);
}

beforeEach(async () => {
  const db = testDb();
  state.db = db;
  outbox = [];
  setMailSenderForTests(async (m) => void outbox.push(m));
  process.env.APP_URL = "https://painel.exemplo.com";
  resetRecoveryLimits();
  resetIpLimits();
  const u = await mkUser(db, "pedro");
  state.userId = u.id;
  state.username = "pedro";
});
afterEach(() => {
  setMailSenderForTests(null);
  delete process.env.APP_URL;
});

describe("e-mail de recuperação", () => {
  test("1. cadastra (com senha) e confirma pelo link; o link usa só o domínio configurado e o token só aparece no fragmento", async () => {
    const db = state.db as Db;
    expect(emailStatus(db, state.userId).state).toBe("none");
    expect((await requestEmailAction("Pedro@Exemplo.com", PASS, "")).ok).toBe(true);
    await flush();
    expect(emailStatus(db, state.userId)).toMatchObject({ state: "pending", pending: "pedro@exemplo.com" });
    const mail = outbox[0];
    expect(mail.to).toBe("pedro@exemplo.com");
    expect(mail.text).toMatch(/https:\/\/painel\.exemplo\.com\/verificar-email#[A-Za-z0-9_-]{43}/);
    // Banco guarda só o hash.
    const row = db.select().from(accountTokens).get()!;
    expect(row.tokenHash).not.toBe(tokenFrom(mail));
    expect(verifyEmailToken(db, tokenFrom(mail), null).ok).toBe(true);
    expect(emailStatus(db, state.userId)).toMatchObject({ state: "verified", email: "pedro@exemplo.com" });
    // Uso único.
    expect(verifyEmailToken(db, tokenFrom(mail), null).ok).toBe(false);
  });

  test("16. trocar o e-mail exige senha (e código com 2FA); e-mail anterior recebe aviso e continua valendo até confirmar", async () => {
    const db = state.db as Db;
    expect(await requestEmailAction("x@exemplo.com", "errada", "")).toEqual({ ok: false, error: "Senha incorreta" });
    await verifyEmail(db, "velho@exemplo.com");
    outbox = [];
    expect((await requestEmailAction("novo@exemplo.com", PASS, "")).ok).toBe(true);
    await flush();
    expect(outbox.map((m) => m.to).sort()).toEqual(["novo@exemplo.com", "velho@exemplo.com"]);
    expect(emailStatus(db, state.userId)).toMatchObject({ state: "verified", email: "velho@exemplo.com", pending: "novo@exemplo.com" });
    // Com 2FA ativo, falta o código: recusa.
    db.update(users).set({ totpEnabled: true, totpSecret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" }).where(eq(users.id, state.userId)).run();
    expect(await requestEmailAction("outro@exemplo.com", PASS, "")).toEqual({ ok: false, error: "Código de verificação inválido" });
  });

  test("formato inválido e e-mail de outra conta (mesma resposta, nada enviado, não confirma)", async () => {
    const db = state.db as Db;
    expect(await requestEmailAction("nao-e-email", PASS, "")).toEqual({ ok: false, error: "E-mail inválido" });
    await verifyEmail(db, "dono@exemplo.com");
    const outro = await mkUser(db, "maria");
    state.userId = outro.id;
    state.username = "maria";
    outbox = [];
    const r = await requestEmailAction("dono@exemplo.com", PASS, "");
    expect(r.ok).toBe(true);
    await flush();
    expect(outbox).toHaveLength(0);
    expect(emailStatus(db, outro.id).state).toBe("pending");
  });
});

describe("2FA exige e-mail verificado", () => {
  test("2/3/4. sem e-mail e com e-mail pendente: bloqueia; verificado: permite", async () => {
    const db = state.db as Db;
    expect((await startTotpAction()).ok).toBe(false);
    await requestEmailAction("pedro@exemplo.com", PASS, "");
    await flush();
    const r = await startTotpAction();
    expect(r).toEqual({ ok: false, error: "Cadastre e confirme seu e-mail para habilitar a autenticação de dois fatores." });
    expect((await confirmTotpAction("123456")).ok).toBe(false);
    const mail = outbox.at(-1)!;
    expect(verifyEmailToken(db, tokenFrom(mail), null).ok).toBe(true);
    expect((await startTotpAction()).ok).toBe(true);
  });

  test("15. conta que já tinha 2FA (sem e-mail): continua entrando; para mudar o 2FA precisa regularizar o e-mail", async () => {
    const db = state.db as Db;
    const secret = startTotp(db, state.userId);
    const t = Date.now();
    db.update(users).set({ totpEnabled: true }).where(eq(users.id, state.userId)).run();
    const login = await attemptLogin(db, "pedro", PASS, new Date(t), null, codeAt(secret, Math.floor(t / 30_000)));
    expect(login.ok).toBe(true);
    expect(await disableTotpAction(PASS, codeAt(secret, Math.floor(t / 30_000)))).toEqual({ ok: false, error: "Cadastre e confirme seu e-mail antes de alterar a autenticação de dois fatores." });
    expect(db.select({ e: users.totpEnabled }).from(users).get()?.e).toBe(true);
  });
});

describe("recuperação de senha", () => {
  test("5/6/12. resposta idêntica com e-mail cadastrado ou inexistente; só o verificado recebe", async () => {
    const db = state.db as Db;
    await verifyEmail(db, "pedro@exemplo.com");
    outbox = [];
    const a = requestPasswordReset(db, "PEDRO@exemplo.com", "1.1.1.1");
    const b = requestPasswordReset(db, "ninguem@exemplo.com", "1.1.1.2");
    const c = requestPasswordReset(db, "lixo", "1.1.1.3");
    expect(a.message).toBe(GENERIC_RESET_MESSAGE);
    expect(b.message).toBe(GENERIC_RESET_MESSAGE);
    expect(c.message).toBe(GENERIC_RESET_MESSAGE);
    await a.sent;
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe("pedro@exemplo.com");
    expect(outbox[0].text).toMatch(/https:\/\/painel\.exemplo\.com\/redefinir-senha#/);
    // E-mail só pendente (não verificado) não recebe.
    const db2 = state.db as Db;
    db2.update(users).set({ email: null, pendingEmail: "pedro@exemplo.com" }).where(eq(users.id, state.userId)).run();
    outbox = [];
    resetRecoveryLimits();
    await requestPasswordReset(db2, "pedro@exemplo.com", "1.1.1.4").sent;
    expect(outbox).toHaveLength(0);
  });

  test("9/10/11. senhas diferentes recusadas; certo troca, encerra sessões, não cria sessão, mantém o 2FA", async () => {
    const db = state.db as Db;
    await verifyEmail(db, "pedro@exemplo.com");
    const old = createSession(db, state.userId);
    outbox = [];
    await requestPasswordReset(db, "pedro@exemplo.com", null).sent;
    const token = tokenFrom(outbox[0]);
    expect(await completePasswordReset(db, token, "Nova-Senha-Forte-9", "Nova-Senha-Forte-8", null)).toEqual({ ok: false, error: "As senhas não são iguais" });
    expect((await completePasswordReset(db, token, "12345678", "12345678", null)).ok).toBe(false);
    const sessionsBefore = db.select().from(sessions).all().length;
    const r = await completePasswordReset(db, token, "Nova-Senha-Forte-9", "Nova-Senha-Forte-9", null);
    expect(r).toEqual({ ok: true, message: "Senha alterada com sucesso. Entre novamente utilizando sua nova senha." });
    expect(sessionsBefore).toBe(1);
    expect(db.select().from(sessions).all()).toHaveLength(0);
    expect(sessionState(db, old.token)).toBeNull();
    const hash = db.select({ h: users.passwordHash }).from(users).get()!.h;
    expect(await verifyPassword(hash, "Nova-Senha-Forte-9")).toBe(true);
    expect(db.select({ e: securityEvents.event }).from(securityEvents).all().map((x) => x.e)).toContain("password_reset_completed");
  });

  test("7/8. token expirado e token já usado são recusados (mensagem genérica)", async () => {
    const db = state.db as Db;
    await verifyEmail(db, "pedro@exemplo.com");
    const t0 = new Date();
    outbox = [];
    await requestPasswordReset(db, "pedro@exemplo.com", null, t0).sent;
    const token = tokenFrom(outbox[0]);
    const late = new Date(t0.getTime() + RESET_TTL_MS + 1000);
    expect((await completePasswordReset(db, token, "Nova-Senha-Forte-9", "Nova-Senha-Forte-9", null, late)).ok).toBe(false);
    expect((await completePasswordReset(db, token, "Nova-Senha-Forte-9", "Nova-Senha-Forte-9", null)).ok).toBe(true);
    const again = await completePasswordReset(db, token, "Outra-Senha-Forte-7", "Outra-Senha-Forte-7", null);
    expect(again).toEqual({ ok: false, error: "Este link é inválido, expirou ou já foi usado. Peça um novo." });
  });

  test("pedido novo invalida o link anterior; dois usos simultâneos: só um vale", async () => {
    const db = state.db as Db;
    await verifyEmail(db, "pedro@exemplo.com");
    outbox = [];
    await requestPasswordReset(db, "pedro@exemplo.com", null).sent;
    await requestPasswordReset(db, "pedro@exemplo.com", null).sent;
    const [first, second] = outbox.map(tokenFrom);
    expect((await completePasswordReset(db, first, "Nova-Senha-Forte-9", "Nova-Senha-Forte-9", null)).ok).toBe(false);
    const both = await Promise.all([
      completePasswordReset(db, second, "Nova-Senha-Forte-9", "Nova-Senha-Forte-9", null),
      completePasswordReset(db, second, "Outra-Senha-Forte-7", "Outra-Senha-Forte-7", null),
    ]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
  });

  test("14. o token só altera a conta dona dele", async () => {
    const db = state.db as Db;
    await verifyEmail(db, "pedro@exemplo.com");
    const maria = await mkUser(db, "maria");
    outbox = [];
    await requestPasswordReset(db, "pedro@exemplo.com", null).sent;
    await completePasswordReset(db, tokenFrom(outbox[0]), "Nova-Senha-Forte-9", "Nova-Senha-Forte-9", null);
    const mh = db.select({ h: users.passwordHash }).from(users).where(eq(users.id, maria.id)).get()!.h;
    expect(await verifyPassword(mh, PASS)).toBe(true);
  });

  test("13. pedidos repetidos são limitados (por e-mail), sempre com a mesma resposta", async () => {
    const db = state.db as Db;
    await verifyEmail(db, "pedro@exemplo.com");
    outbox = [];
    const rs = [];
    for (let i = 0; i < 6; i++) rs.push(requestPasswordReset(db, "pedro@exemplo.com", `10.0.0.${i}`));
    await Promise.all(rs.map((r) => r.sent));
    expect(new Set(rs.map((r) => r.message)).size).toBe(1);
    expect(outbox.length).toBe(3);
  });

  test("17. falha no envio: mesma resposta, sem credenciais nem token; fica só o registro de auditoria", async () => {
    const db = state.db as Db;
    await verifyEmail(db, "pedro@exemplo.com");
    setMailSenderForTests(async () => {
      throw new Error("Falha no envio do e-mail");
    });
    const r = requestPasswordReset(db, "pedro@exemplo.com", null);
    expect(r.message).toBe(GENERIC_RESET_MESSAGE);
    await r.sent;
    const events = db.select({ e: securityEvents.event }).from(securityEvents).all().map((x) => x.e);
    expect(events).toContain("mail_send_failed");
    expect(JSON.stringify(db.select().from(securityEvents).all())).not.toMatch(/[A-Za-z0-9_-]{43}/);
  });

  test("política de senha: recusa comuns, repetidas e com o nome de usuário", () => {
    expect(passwordProblem("12345678", "pedro")).not.toBeNull();
    expect(passwordProblem("aaaaaaaaaa", "pedro")).not.toBeNull();
    expect(passwordProblem("pedro-2026-xyz", "pedro")).not.toBeNull();
    expect(passwordProblem("Nova-Senha-Forte-9", "pedro")).toBeNull();
  });
});
