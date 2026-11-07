// Verificação em duas etapas (TOTP, RFC 6238 — Google Authenticator, Authy, 1Password, Bitwarden etc.).
// Opcional por conta: só vale depois que a pessoa ativa e confirma um código. Usa só a criptografia nativa do Node.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { users } from "@/db/schema";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_S = 30;
const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("base32 inválido");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Segredo novo (160 bits, o tamanho recomendado para HMAC-SHA1). */
export const newSecret = () => base32Encode(randomBytes(20));

/** Código de 6 dígitos de um intervalo de 30 s. */
export function codeAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = h[h.length - 1] & 15;
  const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Confere o código (aceita 1 intervalo antes e depois, para relógios um pouco fora). Devolve o intervalo usado,
 * para que o mesmo código não valha de novo (lastStep); null se inválido.
 */
export function verifyCode(secret: string, code: string, now = Date.now(), lastStep: number | null = null): number | null {
  const c = String(code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const step = Math.floor(now / 1000 / STEP_S);
  for (const s of [step - 1, step, step + 1]) {
    if (lastStep !== null && s <= lastStep) continue;
    if (same(codeAt(secret, s), c)) return s;
  }
  return null;
}

/** Endereço para cadastrar no aplicativo autenticador (também dá para digitar o segredo à mão). */
export function otpauthUri(secret: string, username: string): string {
  const label = encodeURIComponent(`BlackHole Dashboard:${username}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent("BlackHole Dashboard")}&algorithm=SHA1&digits=6&period=30`;
}

// ---------- conta ----------

export type TotpStatus = { enabled: boolean; pending: boolean };

export function totpStatus(db: Db, userId: number): TotpStatus {
  const u = db.select({ secret: users.totpSecret, enabled: users.totpEnabled }).from(users).where(eq(users.id, userId)).get();
  return { enabled: !!u?.enabled, pending: !!u?.secret && !u?.enabled };
}

/** Começa a ativação: gera um segredo novo (ainda não vale para entrar até confirmar um código). */
export function startTotp(db: Db, userId: number): string {
  const secret = newSecret();
  db.update(users).set({ totpSecret: secret, totpEnabled: false, totpLastStep: null }).where(eq(users.id, userId)).run();
  return secret;
}

/** Confirma a ativação com um código do aplicativo. */
export function confirmTotp(db: Db, userId: number, code: string, now = Date.now()): boolean {
  const u = db.select({ secret: users.totpSecret, enabled: users.totpEnabled }).from(users).where(eq(users.id, userId)).get();
  if (!u?.secret || u.enabled) return false;
  const step = verifyCode(u.secret, code, now);
  if (step === null) return false;
  db.update(users).set({ totpEnabled: true, totpLastStep: step }).where(eq(users.id, userId)).run();
  return true;
}

/** Confere o código no login (só para contas com a verificação ligada); marca o intervalo como usado. */
export function checkLoginCode(db: Db, userId: number, code: string, now = Date.now()): boolean {
  const u = db.select({ secret: users.totpSecret, enabled: users.totpEnabled, last: users.totpLastStep }).from(users).where(eq(users.id, userId)).get();
  if (!u?.enabled || !u.secret) return true;
  const step = verifyCode(u.secret, code, now, u.last ?? null);
  if (step === null) return false;
  db.update(users).set({ totpLastStep: step }).where(eq(users.id, userId)).run();
  return true;
}

export function disableTotp(db: Db, userId: number): void {
  db.update(users).set({ totpSecret: null, totpEnabled: false, totpLastStep: null }).where(eq(users.id, userId)).run();
}

export function totpEnabled(db: Db, userId: number): boolean {
  return !!db.select({ enabled: users.totpEnabled }).from(users).where(eq(users.id, userId)).get()?.enabled;
}
