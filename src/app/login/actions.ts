"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { attemptLogin } from "@/lib/auth/login";
import { clientIp, ipLimited, recordIpFailure } from "@/lib/auth/ip-limit";
import { sessionCookieName, sessionCookieOptions } from "@/lib/auth/cookie";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const ip = clientIp((await headers()).get("x-forwarded-for"));
  if (ipLimited(ip)) return { error: "Muitas tentativas. Tente novamente em 15 minutos." };

  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const result = await attemptLogin(getDb(), username, password);
  if (!result.ok) {
    recordIpFailure(ip);
    return { error: "Usuário ou senha inválidos" };
  }

  (await cookies()).set(sessionCookieName(), result.token, sessionCookieOptions(result.expiresAt));
  redirect("/");
}
