import { beforeEach, describe, expect, test, vi } from "vitest";
import { testDb } from "../helpers/db";

const calls = vi.hoisted(() => ({ symbols: 0, candles: 0, fail: false }));
vi.mock("@/lib/prices/binance", async (orig) => ({
  ...(await orig<typeof import("@/lib/prices/binance")>()),
  fetchChartSymbols: async () => {
    calls.symbols++;
    return [
      { symbol: "BTCUSDT", base: "BTC", quote: "USDT" },
      { symbol: "ETHBTC", base: "ETH", quote: "BTC" },
      { symbol: "SOLETH", base: "SOL", quote: "ETH" },
    ];
  },
  fetchCandles: async (symbol: string, interval: string, limit: number, end: number | null) => {
    calls.candles++;
    if (calls.fail) throw new Error("Binance fora");
    return Array.from({ length: Math.min(limit, 3) }, (_, i) => ({
      timestamp: (end ?? 3_000_000) - (3 - i) * 60_000,
      open: 1,
      high: 2,
      low: 0.5,
      close: 1.5,
      volume: 10,
    }));
  },
}));

import { getCandles, isListedSymbol, listChartSymbols, resetCandleCache } from "@/lib/charts/market";

beforeEach(() => {
  calls.symbols = 0;
  calls.candles = 0;
  calls.fail = false;
  resetCandleCache();
});

describe("pares e velas", () => {
  test("lista de pares guardada por um dia", async () => {
    const db = testDb();
    const now = new Date("2026-11-05T12:00:00Z");
    expect((await listChartSymbols(db, now)).map((s) => s.symbol)).toEqual(["BTCUSDT", "ETHBTC", "SOLETH"]);
    await listChartSymbols(db, new Date(now.getTime() + 3_600_000));
    expect(calls.symbols).toBe(1);
    expect(await isListedSymbol(db, "ETHBTC", now)).toBe(true);
    expect(await isListedSymbol(db, "XYZUSDT", now)).toBe(false);
  });

  test("velas recentes ficam em cache por pouco tempo; pedidos iguais simultâneos fazem uma busca só", async () => {
    const now = Date.parse("2026-11-05T12:00:00Z");
    const q = { symbol: "BTCUSDT", interval: "1h" as const, limit: 500, end: null };
    await Promise.all([getCandles(q, now), getCandles(q, now), getCandles(q, now)]);
    expect(calls.candles).toBe(1);
    await getCandles(q, now + 30_000);
    expect(calls.candles).toBe(1);
    await getCandles(q, now + 5 * 60_000);
    expect(calls.candles).toBe(2);
  });

  test("velas antigas (com data final) ficam em cache por mais tempo", async () => {
    const now = Date.parse("2026-11-05T12:00:00Z");
    const q = { symbol: "BTCUSDT", interval: "1h" as const, limit: 500, end: 1_700_000_000_000 };
    await getCandles(q, now);
    await getCandles(q, now + 3_600_000);
    expect(calls.candles).toBe(1);
  });

  test("falha da Binance vira erro (a rota responde 503), sem guardar no cache", async () => {
    calls.fail = true;
    const q = { symbol: "BTCUSDT", interval: "1h" as const, limit: 10, end: null };
    await expect(getCandles(q, 0)).rejects.toThrow();
    calls.fail = false;
    expect(await getCandles(q, 0)).toHaveLength(3);
  });
});
