import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { testDb } from "../helpers/db";
import { resetBinanceState } from "@/lib/prices/binance";
import { getRateHistory, getRates } from "@/lib/prices/rates";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const kline = (closeTime: number, close: string) => [closeTime - 1, "0", "0", "0", close, "0", closeTime];

function stub(handler: (url: URL) => Response) {
  const fn = vi.fn(async (input: string | URL) => handler(new URL(String(input))));
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  resetBinanceState();
  vi.stubEnv("BINANCE_BASE_URL", "https://bn.test");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("getRates", () => {
  test("busca USDTBRL e BTCUSDT num pedido só e guarda por 60 s", async () => {
    const fn = stub((url) => {
      expect(JSON.parse(url.searchParams.get("symbols")!)).toEqual(["BTCUSDT", "USDTBRL"]);
      return json([
        { symbol: "USDTBRL", lastPrice: "5.40", priceChangePercent: "0" },
        { symbol: "BTCUSDT", lastPrice: "80000", priceChangePercent: "0" },
      ]);
    });
    const db = testDb();
    const t0 = new Date("2026-01-01T00:00:00Z");
    expect(await getRates(db, t0)).toEqual({
      usdtBrl: 5.4,
      btcUsdt: 80000,
      usdtBrlChange24h: 0,
      btcUsdtChange24h: 0,
      fetchedAt: t0,
      stale: false,
    });
    await getRates(db, new Date(t0.getTime() + 30_000));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("sem resposta e sem cache: cotações nulas, sem lançar", async () => {
    stub(() => json({}, 503));
    expect(await getRates(testDb())).toEqual({
      usdtBrl: null,
      btcUsdt: null,
      usdtBrlChange24h: null,
      btcUsdtChange24h: null,
      fetchedAt: null,
      stale: false,
    });
  });
});

describe("getRateHistory", () => {
  test("velas de 1 h para 30 dias e diárias para 1000 dias, dos dois pares", async () => {
    const fn = stub(() => json([kline(1000, "5.1")]));
    const r = await getRateHistory(testDb(), 1000);
    const reqs = fn.mock.calls.map((c) => new URL(String(c[0])).searchParams);
    expect(reqs.map((p) => p.get("symbol")).sort()).toEqual(["BTCUSDT", "USDTBRL"]);
    expect(reqs.every((p) => p.get("interval") === "1d" && p.get("limit") === "1000")).toBe(true);
    expect(r.usdtBrl).toEqual([[1000, 5.1]]);
    expect(r.btcUsdt).toEqual([[1000, 5.1]]);

    resetBinanceState();
    const fn2 = stub(() => json([kline(1, "1")]));
    await getRateHistory(testDb(), 30);
    expect(new URL(String(fn2.mock.calls[0][0])).searchParams.get("interval")).toBe("1h");
  });
});
