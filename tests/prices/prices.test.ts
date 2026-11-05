import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { testDb } from "../helpers/db";
import { fetchKlines, resetBinanceState } from "@/lib/prices/binance";
import { getCurrentPrices, getHistory, isListedAsset, searchCoins } from "@/lib/prices";

type Handler = (url: URL, init?: RequestInit) => Promise<Response> | Response;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const EXCHANGE_INFO = {
  symbols: [
    { symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT", status: "TRADING" },
    { symbol: "SOLUSDT", baseAsset: "SOL", quoteAsset: "USDT", status: "TRADING" },
    { symbol: "SOLBTC", baseAsset: "SOL", quoteAsset: "BTC", status: "TRADING" },
    { symbol: "OLDUSDT", baseAsset: "OLD", quoteAsset: "USDT", status: "BREAK" },
    { symbol: "BITUSDT", baseAsset: "BIT", quoteAsset: "USDT", status: "TRADING" },
  ],
};

const ticker = (symbol: string, lastPrice: string, priceChangePercent: string) => ({
  symbol,
  lastPrice,
  priceChangePercent,
});
const kline = (closeTime: number, close: string) => [closeTime - 1, "0", "0", "0", close, "0", closeTime];

/** Responde exchangeInfo sempre; o resto vem do handler do teste. */
function stubFetch(handler: Handler) {
  const fn = vi.fn((input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/v3/exchangeInfo") return Promise.resolve(json(EXCHANGE_INFO));
    return Promise.resolve(handler(url, init));
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const calls = (fn: ReturnType<typeof stubFetch>, path: string) =>
  fn.mock.calls.map((c) => new URL(String(c[0]))).filter((u) => u.pathname === path);

beforeEach(() => {
  resetBinanceState();
  vi.stubEnv("BINANCE_BASE_URL", "https://bn.test");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("lista de moedas", () => {
  test("só pares USDT ativos contam como listados; USDT também", async () => {
    stubFetch(() => json([]));
    const db = testDb();
    expect(await isListedAsset(db, "BTC")).toBe(true);
    expect(await isListedAsset(db, "USDT")).toBe(true);
    expect(await isListedAsset(db, "OLD")).toBe(false);
    expect(await isListedAsset(db, "NADA")).toBe(false);
  });

  test("busca por símbolo e nome: exato primeiro, depois prefixo, com nome amigável", async () => {
    stubFetch(() => json([]));
    const r = (await searchCoins(testDb(), "bit"))!;
    expect(r.map((c) => c.id)).toEqual(["BIT", "BTC"]);
    expect(r[1]).toEqual({ id: "BTC", symbol: "BTC", name: "Bitcoin" });
    expect((await searchCoins(testDb(), "sol"))![0]).toEqual({ id: "SOL", symbol: "SOL", name: "Solana" });
  });

  test("termo curto não busca", async () => {
    const fn = stubFetch(() => json([]));
    expect(await searchCoins(testDb(), "b")).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("getCurrentPrices", () => {
  test("pede só pares listados e converte a resposta; USDT vale 1", async () => {
    const fn = stubFetch(() => json([ticker("BTCUSDT", "60000.5", "1.5"), ticker("SOLUSDT", "100", "-2")]));
    const r = await getCurrentPrices(testDb(), ["SOL", "BTC", "USDT", "NADA"]);
    const req = calls(fn, "/api/v3/ticker/24hr")[0];
    expect(JSON.parse(req.searchParams.get("symbols")!)).toEqual(["BTCUSDT", "SOLUSDT"]);
    expect(r.prices).toEqual({
      BTC: { usd: 60000.5, change24h: 1.5 },
      SOL: { usd: 100, change24h: -2 },
      USDT: { usd: 1, change24h: 0 },
    });
    expect(r.stale).toBe(false);
  });

  test("lista vazia não chama a API", async () => {
    const fn = stubFetch(() => json([]));
    expect(await getCurrentPrices(testDb(), [])).toEqual({ prices: {}, fetchedAt: null, stale: false });
    expect(fn).not.toHaveBeenCalled();
  });

  test("429 sem cache: tenta de novo uma vez e devolve vazio sem lançar", async () => {
    vi.useFakeTimers();
    const fn = stubFetch(() => json({ code: -1003 }, 429));
    const p = getCurrentPrices(testDb(), ["BTC"]);
    await vi.runAllTimersAsync();
    expect(await p).toEqual({ prices: {}, fetchedAt: null, stale: false });
    expect(calls(fn, "/api/v3/ticker/24hr")).toHaveLength(2);
  });

  test("adicionar uma moeda não perde o preço antigo das outras quando a API falha", async () => {
    const db = testDb();
    const t0 = new Date("2026-01-01T00:00:00Z");
    stubFetch(() => json([ticker("BTCUSDT", "100", "1")]));
    await getCurrentPrices(db, ["BTC"], t0);
    resetBinanceState();
    stubFetch(() => json({}, 500));
    const r = await getCurrentPrices(db, ["BTC", "SOL"], new Date(t0.getTime() + 120_000));
    expect(r.prices).toEqual({ BTC: { usd: 100, change24h: 1 } });
    expect(r.stale).toBe(true);
    expect(r.fetchedAt).toEqual(t0);
  });

  test("só busca as moedas sem preço válido no cache", async () => {
    const db = testDb();
    const fn = stubFetch((url) =>
      json(JSON.parse(url.searchParams.get("symbols")!).map((s: string) => ticker(s, "1", "0"))),
    );
    await getCurrentPrices(db, ["BTC"]);
    await getCurrentPrices(db, ["BTC", "SOL"]);
    const reqs = calls(fn, "/api/v3/ticker/24hr");
    expect(JSON.parse(reqs[1].searchParams.get("symbols")!)).toEqual(["SOLUSDT"]);
  });
});

describe("resiliência", () => {
  test("depois de uma falha, pausa a API por 60 s", async () => {
    const fn = stubFetch(() => json({}, 500));
    const db = testDb();
    await getCurrentPrices(db, ["BTC"]);
    await getHistory(db, ["BTC", "SOL"], "30D");
    expect(calls(fn, "/api/v3/ticker/24hr")).toHaveLength(1);
    expect(calls(fn, "/api/v3/klines")).toHaveLength(0);
  });

  test("toda requisição tem timeout", async () => {
    const fn = stubFetch(() => json([]));
    await getCurrentPrices(testDb(), ["BTC"]);
    for (const c of fn.mock.calls) expect(c[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  test("nunca mais de 2 requisições em andamento", async () => {
    let inFlight = 0;
    let max = 0;
    stubFetch(async () => {
      inFlight++;
      max = Math.max(max, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return json([kline(1, "2")]);
    });
    await Promise.all(["A", "B", "C", "D", "E"].map((id) => fetchKlines(id, 30)));
    expect(max).toBe(2);
  });
});

describe("getHistory", () => {
  test("7D e 30D usam as mesmas velas de 1 h dos últimos 30 dias", async () => {
    const fn = stubFetch(() => json([kline(1000, "5")]));
    const db = testDb();
    const a = await getHistory(db, ["BTC"], "7D");
    const b = await getHistory(db, ["BTC"], "30D");
    const reqs = calls(fn, "/api/v3/klines");
    expect(reqs).toHaveLength(1);
    expect(reqs[0].searchParams.get("symbol")).toBe("BTCUSDT");
    expect(reqs[0].searchParams.get("interval")).toBe("1h");
    expect(reqs[0].searchParams.get("limit")).toBe("722");
    expect(a.history).toEqual({ BTC: [[1000, 5]] });
    expect(b.history).toEqual(a.history);
  });

  test("1A usa velas diárias; moeda não listada fica de fora sem chamar a API", async () => {
    const fn = stubFetch(() => json([kline(1, "1")]));
    const r = await getHistory(testDb(), ["BTC", "NADA"], "1A");
    const reqs = calls(fn, "/api/v3/klines");
    expect(reqs).toHaveLength(1);
    expect(reqs[0].searchParams.get("interval")).toBe("1d");
    expect(reqs[0].searchParams.get("limit")).toBe("367");
    expect(Object.keys(r.history)).toEqual(["BTC"]);
  });

  test("USDT tem histórico fixo em 1 sem chamar a API", async () => {
    const fn = stubFetch(() => json([]));
    const now = new Date("2026-03-01T00:00:00Z");
    const r = await getHistory(testDb(), ["USDT"], "30D", now);
    expect(calls(fn, "/api/v3/klines")).toHaveLength(0);
    expect(r.history.USDT[0][1]).toBe(1);
    expect(r.history.USDT[0][0]).toBeLessThanOrEqual(now.getTime() - 30 * 86_400_000);
  });
});
