"use server";

import { getDb } from "@/db/client";
import { changeOwnPassword } from "@/lib/admin/users";
import { requireUser } from "@/lib/auth/current";

export type PasswordState = { error?: string; ok?: boolean };

export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (next !== String(formData.get("confirm") ?? "")) {
    return { error: "A confirmação não confere com a nova senha" };
  }
  const r = await changeOwnPassword(getDb(), user.id, user.sessionHash, current, next);
  return r.ok ? { ok: true } : { error: r.error };
}
