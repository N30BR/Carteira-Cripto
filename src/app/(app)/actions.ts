"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { sessionCookieName } from "@/lib/auth/cookie";
import { deleteSession } from "@/lib/auth/sessions";

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(sessionCookieName())?.value;
  if (token) deleteSession(getDb(), token);
  store.delete(sessionCookieName());
  redirect("/login");
}
