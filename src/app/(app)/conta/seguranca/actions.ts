"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { clientIp, ipLimited, recordIpFailure } from "@/lib/auth/ip-limit";
import { setLockMinutes } from "@/lib/auth/lock";
import { serializeAuth } from "@/lib/auth/login";
import { verifyPassword } from "@/lib/auth/password";
import { confirmTotp, disableTotp, otpauthUri, startTotp, totpStatus, verifyCode } from "@/lib/auth/totp";

type Result = { ok: true } | { ok: false; error: string };

export async function setLockMinutesAction(minutes: number): Promise<Result> {
  const user = await requireUser();
  return setLockMinutes(getDb(), user.id, minutes) ? { ok: true } : { ok: false, error: "Tempo inválido" };
}

/** Começa a ativação da verificação em duas etapas: devolve o segredo (só para a própria pessoa). */
export async function startTotpAction(): Promise<{ ok: true; secret: string; uri: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const db = getDb();
  if (totpStatus(db, user.id).enabled) return { ok: false, error: "A verificação em duas etapas já está ativa" };
  const secret = startTotp(db, user.id);
  return { ok: true, secret, uri: otpauthUri(secret, user.username) };
}

export async function confirmTotpAction(code: string): Promise<Result> {
  const user = await requireUser();
  return confirmTotp(getDb(), user.id, String(code ?? "")) ? { ok: true } : { ok: false, error: "Código inválido. Confira o relógio do celular e tente de novo." };
}

/** Desligar exige a senha e um código válido (quem pegar a sessão aberta não consegue tirar a proteção). */
export async function disableTotpAction(password: string, code: string): Promise<Result> {
  const user = await requireUser();
  const db = getDb();
  const ip = clientIp((await headers()).get("x-forwarded-for"));
  return serializeAuth(async (): Promise<Result> => {
    if (ipLimited(ip)) return { ok: false, error: "Muitas tentativas. Tente novamente em 15 minutos." };
    const u = db.select({ hash: users.passwordHash, secret: users.totpSecret, last: users.totpLastStep }).from(users).where(eq(users.id, user.id)).get();
    const okPass = !!u && (await verifyPassword(u.hash, String(password ?? "")));
    const okCode = !!u?.secret && verifyCode(u.secret, String(code ?? ""), Date.now(), u.last ?? null) !== null;
    if (!okPass || !okCode) {
      recordIpFailure(ip);
      return { ok: false, error: "Senha ou código inválido" };
    }
    disableTotp(db, user.id);
    return { ok: true };
  });
}
