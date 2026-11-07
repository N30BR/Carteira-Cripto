"use server";

import { cookies, headers } from "next/headers";
import { getDb } from "@/db/client";
import { sessionCookieName } from "@/lib/auth/cookie";
import { clientIp } from "@/lib/auth/ip-limit";
import { attemptUnlock } from "@/lib/auth/unlock";

export type UnlockState = { ok: true } | { ok: false; error: string; expired?: boolean };

/** Desbloquear a sessão com a senha (validado no servidor). */
export async function unlockAction(password: string): Promise<UnlockState> {
  const store = await cookies();
  const token = store.get(sessionCookieName())?.value;
  if (!token) return { ok: false, expired: true, error: "Sessão encerrada. Entre de novo." };
  const ip = clientIp((await headers()).get("x-forwarded-for"));
  const r = await attemptUnlock(getDb(), token, typeof password === "string" ? password : "", new Date(), ip);
  if (r.ok) return { ok: true };
  if (r.reason === "expired") {
    store.delete(sessionCookieName());
    return { ok: false, expired: true, error: "Sessão encerrada. Entre de novo." };
  }
  return { ok: false, error: r.reason === "ip" ? "Muitas tentativas. Tente novamente em 15 minutos." : "Senha incorreta" };
}
