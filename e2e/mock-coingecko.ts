// CoinGecko falsa para os testes de ponta a ponta (porta 4010).
import http from "node:http";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

function series(days: number, stepMs: number): [number, number][] {
  const now = Date.now();
  const out: [number, number][] = [];
  for (let t = now - days * DAY; t <= now; t += stepMs) {
    const progress = (t - (now - days * DAY)) / (days * DAY);
    out.push([t, 50000 + 10000 * progress]);
  }
  return out;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const send = (body: unknown) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (url.pathname === "/api/v3/simple/price") {
    return send({ bitcoin: { usd: 60000, usd_24h_change: 1.5 } });
  }
  if (url.pathname === "/api/v3/coins/bitcoin/market_chart") {
    const days = Number(url.searchParams.get("days"));
    return send({ prices: days > 90 ? series(days, DAY) : series(days, HOUR) });
  }
  if (url.pathname === "/api/v3/search") {
    return send({
      coins: [{ id: "bitcoin", symbol: "BTC", name: "Bitcoin", thumb: "" }],
    });
  }
  res.writeHead(404).end();
});

server.listen(4010, () => console.log("mock coingecko em http://localhost:4010"));
