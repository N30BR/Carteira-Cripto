import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { sessionCookieName } from "@/lib/auth/cookie";
import { touchSession } from "@/lib/auth/lock";
import { sameOrigin } from "@/lib/auth/same-origin";
import { createWindowLimiter } from "@/lib/rate-limit";

// Avisos de atividade: no máximo 1 a cada 15 s por aba; limite folgado por sessão.
const limiter = createWindowLimiter(60, 60_000);

/**
 * Atividade real da pessoa (mouse, teclado, rolagem, toque). Só renova sessão NÃO bloqueada;
 * sessão bloqueada responde 423 e continua bloqueada (desbloquear exige a senha).
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origem inválida" }, { status: 403 });
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token) return Response.json({ error: "Não autenticado" }, { status: 401 });
  if (limiter.limited(token)) return Response.json({ error: "Muitos pedidos" }, { status: 429 });
  limiter.hit(token);
  const r = touchSession(getDb(), token);
  if (r.ok) return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  return Response.json({ locked: r.locked }, { status: r.locked ? 423 : 401, headers: { "Cache-Control": "no-store" } });
}
