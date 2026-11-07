import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { sessionCookieName } from "./cookie";
import { sessionState, type SessionState } from "./lock";
import type { SessionUser } from "./sessions";

/** Estado da sessão atual (uma leitura por requisição): usuário e se está bloqueada por inatividade. */
export const getSessionState = cache(async (): Promise<SessionState | null> => {
  const token = (await cookies()).get(sessionCookieName())?.value;
  return token ? sessionState(getDb(), token) : null;
});

/**
 * Usuário da sessão atual. Sessão bloqueada por inatividade conta como sem usuário: nenhuma página, API ou action
 * devolve dados privados até o desbloqueio (validado aqui, no servidor — não só na tela).
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const s = await getSessionState();
  return s && !s.locked ? s.user : null;
});

export async function requireUser(): Promise<SessionUser> {
  const s = await getSessionState();
  if (!s) redirect("/login");
  if (s.locked) redirect("/bloqueio");
  return s.user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/");
  return user;
}
