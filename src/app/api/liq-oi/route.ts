import { getDb } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current";
import { moduleOn } from "@/lib/auth/modules";
import { getHistoricalOpenInterest, isListedSymbol } from "@/lib/charts/market";
import { CHART_INTERVALS } from "@/lib/charts/params";
import { allowOpenInterestRequest } from "@/lib/charts/route-limit";

/**
 * Open interest histórico para o mapa de liquidações: ?symbol=BTCUSDT&interval=1h&from=<ms>.
 * Responde { source: "bybit" | "binance", points: [ms, OI][] } (Bybit com histórico; Binance, ~30 dias, se faltar a Bybit).
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });
  if (!moduleOn(user.id, "charts")) return Response.json({ error: "Gráficos desativados" }, { status: 404 });
  if (!allowOpenInterestRequest(user.id)) return Response.json({ error: "Muitos pedidos, aguarde um minuto" }, { status: 429 });

  const q = new URL(request.url).searchParams;
  const symbol = (q.get("symbol") ?? "").toUpperCase();
  const interval = q.get("interval") ?? "";
  const from = Number(q.get("from") ?? "");
  const now = Date.now();
  if (!/^[A-Z0-9]{2,20}$/.test(symbol) || !(CHART_INTERVALS as readonly string[]).includes(interval) || !Number.isInteger(from) || from < Date.UTC(2017, 0, 1) || from > now) {
    return Response.json({ error: "Pedido inválido" }, { status: 400 });
  }
  const notAvailable = Response.json({ error: "Sem contrato perpétuo em USDT para este par" }, { status: 404 });
  if (!symbol.endsWith("USDT") || !(await isListedSymbol(getDb(), symbol))) return notAvailable;
  try {
    return Response.json(await getHistoricalOpenInterest(symbol, interval, from, now), { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return Response.json({ error: "Open interest indisponível no momento" }, { status: 503 });
  }
}
