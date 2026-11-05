import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { testDb } from "./helpers/db";
import { resetBinanceState } from "@/lib/prices/binance";
import { resolveCurrency } from "@/lib/currency-view";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const DAY = 86_400_000;
const now = new Date("2026-06-01T00:00:00Z");
const kline = (t: number, close: string) => [t - 1, "0", "0", "0", close, "0", t];

beforeEach(() => {
  resetBinanceState();
  vi.stubEnv("BINANCE_BASE_URL", "https://bn.test");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("resolveCurrency", () => {
  test("mesma moeda da base não consulta cotações", async () => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);
    const v = await resolveCurrency(testDb(), "BRL", "BRL", "BRL", now);
    expect(v).toMatchObject({ currency: "BRL", warning: null, staleSince: null });
    expect(v.factorNow).toBe(1);
    expect(v.factorAt(now.getTime() - 5 * DAY)).toBe(1);
    expect(fn).not.toHaveBeenCalled();
  });

  test("converte com a cotação atual e a da época", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("ticker/24hr")) {
        return json([{ symbol: "USDTBRL", lastPrice: "5.5", priceChangePercent: "0" }, { symbol: "BTCUSDT", lastPrice: "1", priceChangePercent: "0" }]);
      }
      const pair = url.searchParams.get("symbol");
      return json(pair === "USDTBRL" ? [kline(now.getTime() - 10 * DAY, "5")] : [kline(1, "1")]);
    }));
    const v = await resolveCurrency(testDb(), "USDT", "BRL", "USDT", now);
    expect(v.currency).toBe("BRL");
    expect(v.factorNow).toBe(5.5);
    expect(v.factorAt(now.getTime() - 7 * DAY)).toBe(5);
  });

  test("sem cotação: volta para a moeda padrão com aviso", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 503)));
    const v = await resolveCurrency(testDb(), "USDT", "BTC", "USDT", now);
    expect(v.currency).toBe("USDT");
    expect(v.factorNow).toBe(1);
    expect(v.warning).toBe("Cotação de BTC indisponível no momento, mostrando em USDT.");
  });
});
