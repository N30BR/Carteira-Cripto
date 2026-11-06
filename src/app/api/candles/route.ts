import { getDb } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current";
import { getCandles, isListedSymbol } from "@/lib/charts/market";
import { parseCandleQuery } from "@/lib/charts/params";
import { allowCandleRequest } from "@/lib/charts/route-limit";

/** Velas OHLCV da Binance para a aba Gráficos: ?symbol=BTCUSDT&interval=1h&limit=500&end=<ms>. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });
  if (!allowCandleRequest(user.id)) return Response.json({ error: "Muitos pedidos, aguarde um minuto" }, { status: 429 });

  const q = parseCandleQuery(new URL(request.url).searchParams);
  if (!q.ok) return Response.json({ error: q.error }, { status: 400 });
  if (!(await isListedSymbol(getDb(), q.value.symbol))) return Response.json({ error: "Par não encontrado" }, { status: 404 });
  try {
    const candles = await getCandles(q.value);
    return Response.json(candles, { headers: { "Cache-Control": "private, max-age=10" } });
  } catch {
    return Response.json({ error: "Preços indisponíveis no momento. Tente de novo em instantes." }, { status: 503 });
  }
}
