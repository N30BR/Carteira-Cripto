// Binance falsa para os testes de ponta a ponta (porta 4010).
import http from "node:http";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** Velas com fechamento subindo de 50000 a 60000 ao longo do período. */
function klines(count: number, stepMs: number): unknown[][] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const close = now - (count - 1 - i) * stepMs;
    const price = 50000 + (10000 * i) / (count - 1);
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
    if (symbols.some((s) => s !== "BTCUSDT")) return send({ code: -1121, msg: "Invalid symbol." }, 400);
    return send([{ symbol: "BTCUSDT", lastPrice: "60000.00", priceChangePercent: "1.500" }]);
  }
  if (url.pathname === "/api/v3/klines" && url.searchParams.get("symbol") === "BTCUSDT") {
    return send(url.searchParams.get("interval") === "1d" ? klines(365, DAY) : klines(720, HOUR));
  }
  res.writeHead(404).end();
});

server.listen(4010, () => console.log("mock binance em http://localhost:4010"));
