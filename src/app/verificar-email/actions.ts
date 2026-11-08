"use server";

import { headers } from "next/headers";
import { getDb } from "@/db/client";
import { clientIp } from "@/lib/auth/ip-limit";
import { verifyEmailToken } from "@/lib/auth/recovery";

/** Confirma o e-mail de recuperação pelo link recebido. */
export async function verifyEmailAction(token: string): Promise<{ ok: true; message?: string } | { ok: false; error: string }> {
  return verifyEmailToken(getDb(), token, clientIp((await headers()).get("x-forwarded-for")));
}
