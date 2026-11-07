import { getDb } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current";
import { moduleOn } from "@/lib/auth/modules";
import { allowMarketRequest } from "@/lib/charts/route-limit";
import { getMarketSeries } from "@/lib/market/data";
import { isMarketId } from "@/lib/market/ids";

/**
 * Série de mercado para os Gráficos e o Comparar: ?id=TOTAL3 (ou BTC.D, USDT.D...).
 * Devolve { points, since, note } — pontos diários reais [ms, valor] e o valor de agora como último ponto.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });
  if (!moduleOn(user.id, "charts") && !moduleOn(user.id, "market")) return Response.json({ error: "Gráficos desativados" }, { status: 404 });
  if (!allowMarketRequest(user.id)) return Response.json({ error: "Muitos pedidos, aguarde um minuto" }, { status: 429 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!isMarketId(id)) return Response.json({ error: "Série inválida" }, { status: 400 });
  try {
    const r = await getMarketSeries(getDb(), id);
    if (!r.points.length) return Response.json({ error: "Dados indisponíveis no momento" }, { status: 503 });
    return Response.json(r, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Dados de mercado indisponíveis no momento" }, { status: 503 });
  }
}
