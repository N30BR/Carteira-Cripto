"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { attemptLogin } from "@/lib/auth/login";
import { clientIp } from "@/lib/auth/ip-limit";
import { sessionCookieName, sessionCookieOptions } from "@/lib/auth/cookie";

export type LoginState = { error?: string; username?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  // Chamada forjada sem formulário: responde como login inválido em vez de quebrar.
  if (!(formData instanceof FormData)) return { error: "Usuário ou senha inválidos" };
  const ip = clientIp((await headers()).get("x-forwarded-for"));
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  const result = await attemptLogin(getDb(), username, password, new Date(), ip);
  if (!result.ok) {
    return result.reason === "ip"
      ? { error: "Muitas tentativas. Tente novamente em 15 minutos.", username }
      : { error: "Usuário ou senha inválidos", username };
  }

  (await cookies()).set(sessionCookieName(), result.token, sessionCookieOptions(result.expiresAt));
  redirect("/");
}
