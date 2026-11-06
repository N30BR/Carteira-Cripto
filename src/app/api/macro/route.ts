import { getDb } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current";
import { MACRO_IDS, MacroUnavailable, getMacroSeries, type MacroId } from "@/lib/charts/macro";
import { allowMacroRequest } from "@/lib/charts/route-limit";

/** Série macro do FRED para comparar nos gráficos: ?id=UST10Y. A chave do FRED nunca sai do servidor. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });
  if (!allowMacroRequest(user.id)) return Response.json({ error: "Muitos pedidos, aguarde um minuto" }, { status: 429 });

  const id = new URL(request.url).searchParams.get("id");
  if (!(MACRO_IDS as readonly (string | null)[]).includes(id)) return Response.json({ error: "Série inválida" }, { status: 400 });
  try {
    const points = await getMacroSeries(getDb(), id as MacroId);
    return Response.json(points, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (e) {
    const message = e instanceof MacroUnavailable ? e.message : "Dados do FRED indisponíveis no momento";
    return Response.json({ error: message }, { status: 503 });
  }
}
