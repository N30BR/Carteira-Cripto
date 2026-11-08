// E-mail de recuperação e redefinição de senha (servidor).
//
// Segurança:
// - Token aleatório de 256 bits; o banco guarda só o SHA-256; uso único (consumo atômico); validade curta
//   (redefinir: 15 min; confirmar e-mail: 24 h); pedir um novo invalida os anteriores do mesmo tipo.
// - O link vai só para o e-mail VERIFICADO da conta e usa só o domínio configurado (nunca o Host do pedido).
//   O token fica no fragmento (#) do link: o navegador não o envia ao servidor nem a outros sites (não aparece em logs
//   de acesso, proxies nem no Referer).
// - Pedido de recuperação: resposta idêntica e envio em segundo plano, exista ou não a conta (sem enumeração).
// - Limites por IP, por e-mail e por conta; auditoria sem senhas, tokens ou links.
// - Redefinir não mexe na verificação em duas etapas, encerra todas as sessões e não cria sessão nova.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { accountTokens, securityEvents, sessions, users } from "@/db/schema";
import { createWindowLimiter } from "@/lib/rate-limit";
import { validatePassword } from "@/lib/validation";
import { mailConfigured, sendMail } from "@/lib/mail/mailer";
import { appBaseUrl } from "./app-url";
import { clearUserPairs } from "./ip-limit";
import { hashPassword } from "./password";

const MIN = 60_000;
export const RESET_TTL_MS = 15 * MIN;
export const VERIFY_TTL_MS = 24 * 60 * MIN;
export const GENERIC_RESET_MESSAGE = "Se este e-mail estiver associado a uma conta válida, você receberá um link para redefinir sua senha.";

type Purpose = "verify_email" | "reset_password";

// ---------- e-mail ----------

/** Normaliza (minúsculas, sem espaços) e valida o formato; null se inválido. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (e.length < 6 || e.length > 254) return null;
  // Formato prático (local@domínio.tld), sem espaços, aspas ou caracteres de controle.
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/.test(e)) return null;
  if (e.includes("..")) return null;
  return e;
}

/** Mostra só o começo do e-mail (para mensagens): "pe***@gmail.com". */
export const maskEmail = (e: string) => {
  const [local, domain] = e.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
};

// ---------- auditoria ----------

export type SecurityEvent =
  | "email_change_requested"
  | "email_verified"
  | "email_verify_failed"
  | "password_reset_requested"
  | "password_reset_completed"
  | "password_reset_invalid"
  | "mail_send_failed";

export function logEvent(db: Db, event: SecurityEvent, userId: number | null, ip: string | null, now = new Date()): void {
  db.insert(securityEvents).values({ event, userId, ip: ip?.slice(0, 64) ?? null, createdAt: now }).run();
}

// ---------- tokens ----------

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const isToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);

function issueToken(db: Db, userId: number, purpose: Purpose, ttl: number, now: Date, email: string | null = null): string {
  const token = randomBytes(32).toString("base64url");
  db.transaction((tx) => {
    // Pedido novo invalida os anteriores do mesmo tipo.
    tx.update(accountTokens)
      .set({ usedAt: now })
      .where(and(eq(accountTokens.userId, userId), eq(accountTokens.purpose, purpose), isNull(accountTokens.usedAt)))
      .run();
    tx.insert(accountTokens).values({ userId, purpose, tokenHash: sha(token), email, createdAt: now, expiresAt: new Date(now.getTime() + ttl) }).run();
  });
  return token;
}

/** Token ainda válido (sem consumir)? */
function peekToken(db: Db, token: unknown, purpose: Purpose, now: Date) {
  if (!isToken(token)) return null;
  return (
    db
      .select()
      .from(accountTokens)
      .where(and(eq(accountTokens.tokenHash, sha(token)), eq(accountTokens.purpose, purpose), isNull(accountTokens.usedAt), gt(accountTokens.expiresAt, now)))
      .get() ?? null
  );
}

/** Consome o token de forma atômica (só uma chamada consegue); devolve o registro ou null. */
function consumeToken(tx: Db, token: string, purpose: Purpose, now: Date) {
  return (
    tx
      .update(accountTokens)
      .set({ usedAt: now })
      .where(and(eq(accountTokens.tokenHash, sha(token)), eq(accountTokens.purpose, purpose), isNull(accountTokens.usedAt), gt(accountTokens.expiresAt, now)))
      .returning()
      .get() ?? null
  );
}

// ---------- limites ----------

const lim = {
  resetIp: createWindowLimiter(10, 15 * MIN),
  resetEmail: createWindowLimiter(3, 15 * MIN),
  resetAccount: createWindowLimiter(5, 60 * MIN),
  tokenIp: createWindowLimiter(30, 15 * MIN),
  emailChange: createWindowLimiter(5, 60 * MIN),
};
const hit = (l: ReturnType<typeof createWindowLimiter>, key: string, now: Date) => {
  if (l.limited(key, now)) return false;
  l.hit(key, now);
  return true;
};
/** Só para testes. */
export function resetRecoveryLimits(): void {
  for (const l of Object.values(lim)) l.reset();
}

/** Envio em segundo plano: o tempo de resposta não revela se a conta existe; falha só vira registro de auditoria. */
function sendInBackground(db: Db, userId: number | null, ip: string | null, mail: Parameters<typeof sendMail>[0]): Promise<void> {
  return sendMail(mail).catch(() => logEvent(db, "mail_send_failed", userId, ip));
}

// ---------- e-mail de recuperação (aba Segurança) ----------

export type EmailStatus = { state: "none" | "pending" | "verified"; email: string | null; pending: string | null; mailReady: boolean };

export function emailStatus(db: Db, userId: number, now = new Date()): EmailStatus {
  const u = db.select({ email: users.email, pending: users.pendingEmail }).from(users).where(eq(users.id, userId)).get();
  // Pendente só enquanto houver um link de confirmação válido.
  const open = db
    .select({ id: accountTokens.id })
    .from(accountTokens)
    .where(and(eq(accountTokens.userId, userId), eq(accountTokens.purpose, "verify_email"), isNull(accountTokens.usedAt), gt(accountTokens.expiresAt, now)))
    .get();
  const pending = u?.pending && open ? u.pending : null;
  const mailReady = mailConfigured() && appBaseUrl() !== null;
  if (u?.email) return { state: "verified", email: u.email, pending, mailReady };
  return { state: pending ? "pending" : "none", email: null, pending, mailReady };
}

export const hasVerifiedEmail = (db: Db, userId: number) => !!db.select({ email: users.email }).from(users).where(eq(users.id, userId)).get()?.email;

export type Result = { ok: true; message?: string } | { ok: false; error: string };

/**
 * Pede o cadastro/troca do e-mail de recuperação. A reautenticação (senha e, se ativo, código 2FA) é conferida antes,
 * por quem chama. Envia o link de confirmação ao e-mail novo e, se já havia um verificado, um aviso para ele.
 * O e-mail atual continua valendo até o novo ser confirmado.
 */
export async function requestEmailChange(db: Db, userId: number, rawEmail: unknown, ip: string | null, now = new Date()): Promise<Result> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, error: "E-mail inválido" };
  const base = appBaseUrl();
  if (!mailConfigured() || !base) return { ok: false, error: "O envio de e-mails ainda não está configurado no servidor." };
  if (!hit(lim.emailChange, String(userId), now)) return { ok: false, error: "Muitas solicitações. Tente novamente mais tarde." };
  const u = db.select({ email: users.email, username: users.username }).from(users).where(eq(users.id, userId)).get();
  if (!u) return { ok: false, error: "Conta não encontrada" };
  if (u.email === email) return { ok: false, error: "Este já é o seu e-mail verificado" };
  const message = `Enviamos um link de confirmação para ${maskEmail(email)}. Ele vale por 24 horas.`;
  // E-mail já verificado em outra conta: mesma resposta, nada é enviado (não revela contas).
  const taken = db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  db.update(users).set({ pendingEmail: email }).where(eq(users.id, userId)).run();
  logEvent(db, "email_change_requested", userId, ip, now);
  const token = issueToken(db, userId, "verify_email", VERIFY_TTL_MS, now, email);
  // Mesmo estado na tela ("pendente"), mas sem enviar nada; a confirmação também recusaria (e-mail de outra conta).
  if (taken) return { ok: true, message };
  const link = `${base}/verificar-email#${token}`;
  void sendInBackground(db, userId, ip, {
    to: email,
    subject: "BlackHole Dashboard — confirme seu e-mail de recuperação",
    text:
      `Olá, ${u.username}.\n\nPara confirmar este endereço como e-mail de recuperação da sua conta no BlackHole Dashboard, abra o link abaixo ` +
      `(válido por 24 horas, uso único):\n\n${link}\n\nSe você não pediu isso, ignore esta mensagem.`,
  });
  if (u.email) {
    void sendInBackground(db, userId, ip, {
      to: u.email,
      subject: "BlackHole Dashboard — pedido de troca do e-mail de recuperação",
      text:
        `Olá, ${u.username}.\n\nFoi pedida a troca do e-mail de recuperação da sua conta para ${maskEmail(email)}. ` +
        `Este endereço continua valendo até o novo ser confirmado.\n\nSe não foi você, entre no dashboard, troque sua senha e ative a verificação em duas etapas.`,
    });
  }
  return { ok: true, message };
}

/** Confirma o e-mail pelo link. Só vale se o e-mail do link ainda for o pendente da conta. */
export function verifyEmailToken(db: Db, token: unknown, ip: string | null, now = new Date()): Result {
  if (!hit(lim.tokenIp, ip ?? "-", now)) return { ok: false, error: "Muitas tentativas. Tente novamente mais tarde." };
  if (!isToken(token)) return { ok: false, error: "Link inválido ou expirado." };
  const r = db.transaction((tx) => {
    const t = consumeToken(tx as unknown as Db, token, "verify_email", now);
    if (!t?.email) return null;
    const u = tx.select({ pending: users.pendingEmail }).from(users).where(eq(users.id, t.userId)).get();
    if (u?.pending !== t.email) return null;
    const taken = tx.select({ id: users.id }).from(users).where(eq(users.email, t.email)).get();
    if (taken && taken.id !== t.userId) return null;
    tx.update(users).set({ email: t.email, emailVerifiedAt: now, pendingEmail: null }).where(eq(users.id, t.userId)).run();
    return t.userId;
  });
  if (r === null) {
    logEvent(db, "email_verify_failed", null, ip, now);
    return { ok: false, error: "Link inválido ou expirado." };
  }
  logEvent(db, "email_verified", r, ip, now);
  return { ok: true, message: "E-mail confirmado. Ele já pode ser usado para recuperar a senha." };
}

// ---------- recuperação de senha ----------

/**
 * Pedido de recuperação: sempre a mesma resposta. Só envia se o e-mail for o VERIFICADO de uma conta e os limites
 * permitirem. O envio acontece em segundo plano (o tempo de resposta é o mesmo nos dois casos).
 */
export function requestPasswordReset(db: Db, rawEmail: unknown, ip: string | null, now = new Date()): { ok: true; message: string; sent?: Promise<void> } {
  const generic = { ok: true as const, message: GENERIC_RESET_MESSAGE };
  const email = normalizeEmail(rawEmail);
  if (!hit(lim.resetIp, ip ?? "-", now) || !email || !hit(lim.resetEmail, email, now)) return generic;
  const u = db.select({ id: users.id, username: users.username }).from(users).where(eq(users.email, email)).get();
  logEvent(db, "password_reset_requested", u?.id ?? null, ip, now);
  const base = appBaseUrl();
  if (!u || !base || !mailConfigured() || !hit(lim.resetAccount, String(u.id), now)) return generic;
  const token = issueToken(db, u.id, "reset_password", RESET_TTL_MS, now);
  const sent = sendInBackground(db, u.id, ip, {
    to: email,
    subject: "BlackHole Dashboard — redefinição de senha",
    text:
      `Olá, ${u.username}.\n\nRecebemos um pedido para redefinir a senha da sua conta. Abra o link abaixo para escolher uma senha nova ` +
      `(válido por 15 minutos, uso único):\n\n${base}/redefinir-senha#${token}\n\n` +
      `Se você não pediu, ignore esta mensagem: sua senha continua a mesma. A verificação em duas etapas, se estiver ativa, continua valendo.`,
  });
  return { ...generic, sent };
}

/** O link de redefinição ainda vale? (para a tela mostrar o formulário ou o aviso de link expirado) */
export function checkResetToken(db: Db, token: unknown, ip: string | null, now = new Date()): boolean {
  if (!hit(lim.tokenIp, ip ?? "-", now)) return false;
  return !!peekToken(db, token, "reset_password", now);
}

// ---------- política de senha (redefinição) ----------

const COMMON = new Set(
  "123456 1234567 12345678 123456789 1234567890 password password1 senha senha123 senha1234 qwerty qwerty123 abc123 abcd1234 111111 000000 iloveyou admin admin123 letmein welcome 123123 654321 bitcoin blackhole dashboard carteira cripto".split(" "),
);

/** Política da aplicação (8–256 caracteres) + recusa de senhas óbvias. null = ok. */
export function passwordProblem(pw: string, username: string): string | null {
  const base = validatePassword(pw);
  if (base) return base;
  const low = pw.toLowerCase();
  if (COMMON.has(low) || COMMON.has(low.replace(/[^a-z0-9]/g, ""))) return "Senha muito comum. Escolha outra.";
  if (/^(.)\1+$/.test(pw)) return "Senha muito fraca (um caractere repetido).";
  if (username && low.includes(username.toLowerCase())) return "A senha não pode conter o nome de usuário.";
  if (new Set(pw).size < 5) return "Senha muito fraca. Use mais variedade de caracteres.";
  return null;
}

/**
 * Redefine a senha pelo link: confere as duas senhas e a política, consome o token de forma atômica, troca o hash
 * (argon2), encerra TODAS as sessões e invalida outros links de redefinição. Não cria sessão nova nem mexe no 2FA.
 */
export async function completePasswordReset(db: Db, token: unknown, password: unknown, confirm: unknown, ip: string | null, now = new Date()): Promise<Result> {
  if (!hit(lim.tokenIp, ip ?? "-", now)) return { ok: false, error: "Muitas tentativas. Tente novamente mais tarde." };
  const invalid = { ok: false as const, error: "Este link é inválido, expirou ou já foi usado. Peça um novo." };
  if (typeof password !== "string" || typeof confirm !== "string") return { ok: false, error: "Preencha as duas senhas" };
  if (password !== confirm) return { ok: false, error: "As senhas não são iguais" };
  const t = peekToken(db, token, "reset_password", now);
  if (!t) {
    logEvent(db, "password_reset_invalid", null, ip, now);
    return invalid;
  }
  const u = db.select({ username: users.username }).from(users).where(eq(users.id, t.userId)).get();
  if (!u) return invalid;
  const problem = passwordProblem(password, u.username);
  if (problem) return { ok: false, error: problem };
  const hash = await hashPassword(password);
  const userId = db.transaction((tx) => {
    const used = consumeToken(tx as unknown as Db, token as string, "reset_password", now);
    if (!used) return null;
    tx.update(users).set({ passwordHash: hash, failedAttempts: 0, lockedUntil: null }).where(eq(users.id, used.userId)).run();
    tx.delete(sessions).where(eq(sessions.userId, used.userId)).run();
    tx.update(accountTokens)
      .set({ usedAt: now })
      .where(and(eq(accountTokens.userId, used.userId), eq(accountTokens.purpose, "reset_password"), isNull(accountTokens.usedAt)))
      .run();
    return used.userId;
  });
  if (userId === null) {
    logEvent(db, "password_reset_invalid", null, ip, now);
    return invalid;
  }
  clearUserPairs(userId);
  logEvent(db, "password_reset_completed", userId, ip, now);
  return { ok: true, message: "Senha alterada com sucesso. Entre novamente utilizando sua nova senha." };
}
