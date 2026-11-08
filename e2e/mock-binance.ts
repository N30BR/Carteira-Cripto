// Binance falsa para os testes de ponta a ponta (porta 4010).
// BTC a US$ 60.000 e 1 USDT = R$ 5, para os valores do teste serem fáceis de conferir.
import http from "node:http";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

const PRICES: Record<string, { last: string; change: string; from: number; to: number }> = {
  BTCUSDT: { last: "60000.00", change: "1.500", from: 50000, to: 60000 },
  USDTBRL: { last: "5.00", change: "0.000", from: 5, to: 5 },
  PAXGUSDT: { last: "2600.00", change: "0.200", from: 2400, to: 2600 },
  // Seletor de pares (ordem por capitalização) e pares sintéticos (XLM/BTC = XLM/USDT ÷ BTC/USDT).
  ETHUSDT: { last: "3000.00", change: "0.800", from: 2500, to: 3000 },
  XLMUSDT: { last: "0.30", change: "1.000", from: 0.25, to: 0.3 },
  TAOUSDT: { last: "400.00", change: "2.000", from: 300, to: 400 },
  AAVEUSDT: { last: "150.00", change: "-1.000", from: 160, to: 150 },
  ETHBTC: { last: "0.05", change: "0.100", from: 0.05, to: 0.05 },
};

/** Velas com fechamento indo de `from` a `to` ao longo do período. */
function klines(pair: string, count: number, stepMs: number, endTime?: number): unknown[][] {
  const { from, to } = PRICES[pair];
  // Como a Binance: com endTime, as velas terminam nessa data (histórico mais antigo).
  // Como a Binance: horários alinhados ao tempo da vela (iguais em todos os pares).
  const now = Math.floor((endTime ?? Date.now()) / stepMs) * stepMs;
  return Array.from({ length: count }, (_, i) => {
    const close = now - (count - 1 - i) * stepMs;
    const price = from + ((to - from) * i) / (count - 1);
    // Abertura, máxima, mínima e volume plausíveis (a aba Gráficos desenha velas); o fechamento segue a reta.
    const wave = Math.sin(i / 3) * (to - from || price) * 0.01;
    const open = price - wave;
    const high = Math.max(open, price) + Math.abs(wave) * 0.6;
    const low = Math.min(open, price) - Math.abs(wave) * 0.6;
    const volume = 100 + (i % 7) * 20;
    // Como a Binance: [abertura, o, h, l, c, volume, fechamento, volume em cotação, negócios, volume comprador agressor].
    const takerBuy = volume * (0.5 + Math.sin(i / 2) * 0.2);
    return [close - stepMs, String(open), String(high), String(low), String(price), String(volume), close, "0", 0, String(takerBuy)];
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const send = (body: unknown, status = 200) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (url.pathname === "/api/v3/exchangeInfo") {
    return send({
      symbols: [
        { symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT", status: "TRADING" },
        { symbol: "PAXGUSDT", baseAsset: "PAXG", quoteAsset: "USDT", status: "TRADING" },
        ...["ETH", "XLM", "TAO", "AAVE"].map((b) => ({ symbol: `${b}USDT`, baseAsset: b, quoteAsset: "USDT", status: "TRADING" })),
        { symbol: "ETHBTC", baseAsset: "ETH", quoteAsset: "BTC", status: "TRADING" },
      ],
    });
  }
  if (url.pathname === "/api/v3/ticker/24hr") {
    const symbols: string[] = JSON.parse(url.searchParams.get("symbols") ?? "[]");
    if (symbols.some((s) => !PRICES[s])) return send({ code: -1121, msg: "Invalid symbol." }, 400);
    return send(symbols.map((s) => ({ symbol: s, lastPrice: PRICES[s].last, priceChangePercent: PRICES[s].change })));
  }
  const pair = url.searchParams.get("symbol") ?? "";
  // Binance Futures: open interest subindo e descendo (heatmap de liquidações).
  if (url.pathname === "/futures/data/openInterestHist" && pair === "BTCUSDT") {
    const now = Date.now();
    return send(
      Array.from({ length: 500 }, (_, i) => ({
        symbol: pair,
        sumOpenInterest: String(80_000 + Math.sin(i / 5) * 2_000 + i * 10),
        timestamp: now - (499 - i) * DAY,
      })),
    );
  }
  if (url.pathname === "/api/v3/klines" && PRICES[pair]) {
    const limit = Number(url.searchParams.get("limit"));
    const end = url.searchParams.get("endTime");
    const endTime = end ? Number(end) : undefined;
    return send(url.searchParams.get("interval") === "1d" ? klines(pair, limit, DAY, endTime) : klines(pair, limit, HOUR, endTime));
  }
  res.writeHead(404).end();
});

server.listen(4010, () => console.log("mock binance em http://localhost:4010"));
