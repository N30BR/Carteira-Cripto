// Binance falsa para os testes de ponta a ponta (porta 4010).
// BTC a US$ 60.000 e 1 USDT = R$ 5, para os valores do teste serem fáceis de conferir.
import http from "node:http";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

const PRICES: Record<string, { last: string; change: string; from: number; to: number }> = {
  BTCUSDT: { last: "60000.00", change: "1.500", from: 50000, to: 60000 },
  USDTBRL: { last: "5.00", change: "0.000", from: 5, to: 5 },
};

/** Velas com fechamento indo de `from` a `to` ao longo do período. */
function klines(pair: string, count: number, stepMs: number): unknown[][] {
  const { from, to } = PRICES[pair];
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const close = now - (count - 1 - i) * stepMs;
    const price = from + ((to - from) * i) / (count - 1);
    return [close - stepMs, "0", "0", "0", String(price), "0", close];
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const send = (body: unknown, status = 200) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (url.pathname === "/api/v3/exchangeInfo") {
    return send({ symbols: [{ symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT", status: "TRADING" }] });
  }
  if (url.pathname === "/api/v3/ticker/24hr") {
    const symbols: string[] = JSON.parse(url.searchParams.get("symbols") ?? "[]");
    if (symbols.some((s) => !PRICES[s])) return send({ code: -1121, msg: "Invalid symbol." }, 400);
    return send(symbols.map((s) => ({ symbol: s, lastPrice: PRICES[s].last, priceChangePercent: PRICES[s].change })));
  }
  const pair = url.searchParams.get("symbol") ?? "";
  if (url.pathname === "/api/v3/klines" && PRICES[pair]) {
    const limit = Number(url.searchParams.get("limit"));
    return send(url.searchParams.get("interval") === "1d" ? klines(pair, limit, DAY) : klines(pair, limit, HOUR));
  }
  res.writeHead(404).end();
});

server.listen(4010, () => console.log("mock binance em http://localhost:4010"));
