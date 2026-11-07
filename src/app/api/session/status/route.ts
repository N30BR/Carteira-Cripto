import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { sessionCookieName } from "@/lib/auth/cookie";
import { sessionState } from "@/lib/auth/lock";

/** Estado da sessão (não conta como atividade): a tela confere ao voltar para a aba ou depois de suspender. */
export async function GET() {
  const token = (await cookies()).get(sessionCookieName())?.value;
  const s = token ? sessionState(getDb(), token) : null;
  if (!s) return Response.json({ error: "Não autenticado" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return Response.json({ locked: s.locked, lockMinutes: s.lockMinutes }, { headers: { "Cache-Control": "no-store" } });
}
