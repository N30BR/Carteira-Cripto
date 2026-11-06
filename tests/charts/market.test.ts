import { beforeEach, describe, expect, test, vi } from "vitest";
import { testDb } from "../helpers/db";

const calls = vi.hoisted(() => ({ symbols: 0, candles: 0, fail: false, symbolsFail: false, oi: 0, oiFail: false }));
vi.mock("@/lib/prices/binance", async (orig) => ({
  ...(await orig<typeof import("@/lib/prices/binance")>()),
  fetchChartSymbols: async () => {
    calls.symbols++;
    if (calls.symbolsFail) throw new Error("exchangeInfo fora");
    return [
      { symbol: "BTCUSDT", base: "BTC", quote: "USDT" },
      { symbol: "ETHBTC", base: "ETH", quote: "BTC" },
      { symbol: "SOLETH", base: "SOL", quote: "ETH" },
    ];
  },
  fetchOpenInterest: async () => {
    calls.oi++;
    if (calls.oiFail) throw new Error("fapi fora");
    return [[1, 1]];
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

import { getCandles, isListedSymbol, listChartSymbols, resetCandleCache, resetListingCache } from "@/lib/charts/market";

beforeEach(() => {
  calls.oi = 0;
  calls.symbols = 0;
  calls.candles = 0;
  calls.fail = false;
  resetCandleCache();
  resetListingCache();
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

describe("revisão: lista de pares, data final e open interest", () => {
  test("lista indisponível: aceita pares com formato válido (a Binance decide) e não baixa de novo a cada pedido", async () => {
    const { isListedSymbol, resetListingCache } = await import("@/lib/charts/market");
    resetListingCache();
    calls.symbolsFail = true;
    const db = testDb();
    const now = new Date("2026-11-05T12:00:00Z");
    expect(await isListedSymbol(db, "SOLUSDT", now)).toBe(true);
    expect(await isListedSymbol(db, "SOLBRL", now)).toBe(false);
    await isListedSymbol(db, "ADAUSDT", new Date(now.getTime() + 10_000));
    expect(calls.symbols).toBe(1); // falha guardada por alguns minutos
    calls.symbolsFail = false;
  });

  test("data final no futuro conta como 'mais recentes' (não fica 1 dia em cache)", async () => {
    const now = Date.parse("2026-11-05T12:00:00Z");
    const q = { symbol: "BTCUSDT", interval: "1h" as const, limit: 500, end: now + 86_400_000 };
    await getCandles(q, now);
    await getCandles({ ...q, end: null }, now);
    expect(calls.candles).toBe(1);
  });

  test("open interest: falha fica guardada por um minuto (não repete pedidos à Futures)", async () => {
    const { getOpenInterest, resetOpenInterestCache } = await import("@/lib/charts/market");
    resetOpenInterestCache();
    calls.oiFail = true;
    await expect(getOpenInterest("BTCUSDT", "1h", 0)).rejects.toThrow();
    await expect(getOpenInterest("BTCUSDT", "1h", 30_000)).rejects.toThrow();
    expect(calls.oi).toBe(1);
    calls.oiFail = false;
    expect(await getOpenInterest("BTCUSDT", "1h", 90_000)).toEqual([[1, 1]]);
  });
});
