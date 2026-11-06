import { getDb } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current";
import { moduleOn } from "@/lib/auth/modules";
import { ONCHAIN_IDS, OnchainUnavailable, getOnchainSeries, type OnchainId } from "@/lib/charts/onchain";
import { allowOnchainRequest } from "@/lib/charts/route-limit";

/**
 * Indicador on-chain do Bitcoin para comparar nos gráficos: ?id=NUPL.
 * Devolve { points, source, stale, note } — só dados reais das fontes gratuitas.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });
  if (!moduleOn(user.id, "charts")) return Response.json({ error: "Gráficos desativados" }, { status: 404 });
  if (!allowOnchainRequest(user.id)) return Response.json({ error: "Muitos pedidos, aguarde um minuto" }, { status: 429 });

  const id = new URL(request.url).searchParams.get("id");
  if (!(ONCHAIN_IDS as readonly (string | null)[]).includes(id)) return Response.json({ error: "Indicador inválido" }, { status: 400 });
  try {
    const r = await getOnchainSeries(getDb(), id as OnchainId);
    return Response.json(r, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (e) {
    const message = e instanceof OnchainUnavailable ? e.message : "Dados on-chain indisponíveis no momento";
    return Response.json({ error: message }, { status: 503 });
  }
}
