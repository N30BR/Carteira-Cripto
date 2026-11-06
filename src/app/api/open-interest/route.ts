import { getDb } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current";
import { moduleOn } from "@/lib/auth/modules";
import { getOpenInterest, isListedSymbol } from "@/lib/charts/market";
import { CHART_INTERVALS } from "@/lib/charts/params";
import { allowOpenInterestRequest } from "@/lib/charts/route-limit";
import { BinanceError } from "@/lib/prices/binance";

/** Open interest do perpétuo (Binance Futures) para o heatmap de liquidações: ?symbol=BTCUSDT&interval=1h. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });
  if (!moduleOn(user.id, "charts")) return Response.json({ error: "Gráficos desativados" }, { status: 404 });
  if (!allowOpenInterestRequest(user.id)) return Response.json({ error: "Muitos pedidos, aguarde um minuto" }, { status: 429 });

  const q = new URL(request.url).searchParams;
  const symbol = (q.get("symbol") ?? "").toUpperCase();
  const interval = q.get("interval") ?? "";
  if (!/^[A-Z0-9]{2,20}$/.test(symbol) || !(CHART_INTERVALS as readonly string[]).includes(interval)) {
    return Response.json({ error: "Pedido inválido" }, { status: 400 });
  }
  const notAvailable = Response.json({ error: "Sem contrato perpétuo em USDT para este par" }, { status: 404 });
  if (!symbol.endsWith("USDT") || !(await isListedSymbol(getDb(), symbol))) return notAvailable;
  try {
    return Response.json(await getOpenInterest(symbol, interval), { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (e) {
    if (e instanceof BinanceError && e.isRequestError) return notAvailable;
    return Response.json({ error: "Binance Futures indisponível no momento" }, { status: 503 });
  }
}
