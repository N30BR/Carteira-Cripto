"use server";

import { headers } from "next/headers";
import { getDb } from "@/db/client";
import { clientIp } from "@/lib/auth/ip-limit";
import { checkResetToken, completePasswordReset } from "@/lib/auth/recovery";

const ipOf = async () => clientIp((await headers()).get("x-forwarded-for"));

/** O link ainda vale? (não consome) */
export async function checkResetTokenAction(token: string): Promise<boolean> {
  return checkResetToken(getDb(), token, await ipOf());
}

/** Troca a senha pelo link (validação de novo no servidor; token consumido de forma atômica). */
export async function resetPasswordAction(token: string, password: string, confirm: string): Promise<{ ok: true; message?: string } | { ok: false; error: string }> {
  return completePasswordReset(getDb(), token, password, confirm, await ipOf());
}
