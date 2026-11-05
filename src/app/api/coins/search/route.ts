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
  const results = await searchCoins(getDb(), q);
  if (results === null) {
    return Response.json({ error: "Lista de moedas indisponível no momento. Tente de novo em instantes." }, { status: 503 });
  }
  return Response.json(results);
}
