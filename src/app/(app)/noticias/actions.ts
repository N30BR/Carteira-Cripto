"use server";

import { getDb } from "@/db/client";
import { requireModule } from "@/lib/auth/modules";
import { getNewsData } from "@/lib/news/source";
import { createWindowLimiter } from "@/lib/rate-limit";

// Botão "Atualizar": no máximo 6 por minuto por pessoa; a fonte em si só é consultada a cada 2 min (forçado).
const limiter = createWindowLimiter(6, 60_000);

export async function refreshNewsAction(): Promise<{ ok: true; stale: boolean } | { ok: false; error: string }> {
  const user = await requireModule("news");
  const key = String(user.id);
  if (limiter.limited(key)) return { ok: false, error: "Muitas atualizações seguidas. Aguarde um minuto." };
  limiter.hit(key);
  const r = await getNewsData(getDb(), new Date(), true);
  return { ok: true, stale: r.stale };
}
