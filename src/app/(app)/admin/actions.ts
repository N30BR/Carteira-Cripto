"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireAdmin } from "@/lib/auth/current";
import { createUser, deleteUser, resetPassword, unlockUser, type Result } from "@/lib/admin/users";

const notFound: Result = { ok: false, error: "Usuário não encontrado" };

export async function createUserAction(formData: FormData): Promise<Result> {
  await requireAdmin();
  const r = await createUser(getDb(), {
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
    isAdmin: formData.get("isAdmin") === "on",
  });
  revalidatePath("/admin");
  return r;
}

export async function resetPasswordAction(userId: number, formData: FormData): Promise<Result> {
  await requireAdmin();
  if (!Number.isInteger(userId)) return notFound;
  const r = await resetPassword(getDb(), userId, String(formData.get("password") ?? ""));
  revalidatePath("/admin");
  return r;
}

export async function unlockUserAction(userId: number): Promise<Result> {
  await requireAdmin();
  if (!Number.isInteger(userId)) return notFound;
  const r = unlockUser(getDb(), userId);
  revalidatePath("/admin");
  return r;
}

export async function deleteUserAction(userId: number): Promise<Result> {
  const admin = await requireAdmin();
  if (!Number.isInteger(userId)) return notFound;
  const r = deleteUser(getDb(), admin.id, userId);
  revalidatePath("/admin");
  return r;
}
