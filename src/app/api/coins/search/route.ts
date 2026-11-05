import { getDb } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current";
import { createWindowLimiter } from "@/lib/rate-limit";
import { searchCoins } from "@/lib/prices";

const limiter = createWindowLimiter(30, 60_000);

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });

  const key = String(user.id);
  if (limiter.limited(key)) {
    return Response.json({ error: "Muitas buscas, aguarde um minuto" }, { status: 429 });
  }
  limiter.hit(key);

  const q = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json(await searchCoins(getDb(), q));
}
