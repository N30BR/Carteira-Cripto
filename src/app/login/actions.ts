"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { attemptLogin } from "@/lib/auth/login";
import { clientIp } from "@/lib/auth/ip-limit";
import { sessionCookieName, sessionCookieOptions } from "@/lib/auth/cookie";

export type LoginState = { error?: string; username?: string; needCode?: boolean };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  // Chamada forjada sem formulário: responde como login inválido em vez de quebrar.
  if (!(formData instanceof FormData)) return { error: "Usuário ou senha inválidos" };
  const ip = clientIp((await headers()).get("x-forwarded-for"));
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "").trim() || null;

  const result = await attemptLogin(getDb(), username, password, new Date(), ip, code);
  if (!result.ok) {
    if (result.reason === "ip") return { error: "Muitas tentativas. Tente novamente em 15 minutos.", username };
    if (result.reason === "totp") return { needCode: true, username };
    if (result.reason === "totp_invalid") return { error: "Código de verificação inválido", username, needCode: true };
    return { error: "Usuário ou senha inválidos", username };
  }

  (await cookies()).set(sessionCookieName(), result.token, sessionCookieOptions(result.expiresAt));
  redirect("/");
}
