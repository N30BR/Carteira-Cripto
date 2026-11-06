import { describe, expect, test } from "vitest";
import { CHART_INTERVALS, CHART_QUOTES, parseCandleQuery, splitSymbol } from "@/lib/charts/params";

describe("parâmetros das velas", () => {
  test("tempos aceitos e cotações USDT/BTC/ETH", () => {
    expect(CHART_INTERVALS).toEqual(["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"]);
    expect(CHART_QUOTES).toEqual(["USDT", "BTC", "ETH"]);
  });

  test("consulta válida com padrões", () => {
    expect(parseCandleQuery(new URLSearchParams("symbol=btcusdt&interval=1h"))).toEqual({
      ok: true,
      value: { symbol: "BTCUSDT", interval: "1h", limit: 500, end: null },
    });
    expect(parseCandleQuery(new URLSearchParams("symbol=ETHBTC&interval=1d&limit=1000&end=1700000000000"))).toEqual({
      ok: true,
      value: { symbol: "ETHBTC", interval: "1d", limit: 1000, end: 1700000000000 },
    });
  });

  test("recusa par, tempo, quantidade e data inválidos", () => {
    const bad = (q: string) => parseCandleQuery(new URLSearchParams(q)).ok;
    expect(bad("interval=1h")).toBe(false);
    expect(bad("symbol=BTC/USDT&interval=1h")).toBe(false);
    expect(bad("symbol=" + "A".repeat(30) + "&interval=1h")).toBe(false);
    expect(bad("symbol=BTCUSDT&interval=2h")).toBe(false);
    expect(bad("symbol=BTCUSDT&interval=1h&limit=0")).toBe(false);
    expect(bad("symbol=BTCUSDT&interval=1h&limit=1001")).toBe(false);
    expect(bad("symbol=BTCUSDT&interval=1h&limit=1.5")).toBe(false);
    expect(bad("symbol=BTCUSDT&interval=1h&end=abc")).toBe(false);
    expect(bad("symbol=BTCUSDT&interval=1h&end=-5")).toBe(false);
  });

  test("separa base e cotação", () => {
    expect(splitSymbol("BTCUSDT")).toEqual({ base: "BTC", quote: "USDT" });
    expect(splitSymbol("SOLETH")).toEqual({ base: "SOL", quote: "ETH" });
    expect(splitSymbol("ETHBTC")).toEqual({ base: "ETH", quote: "BTC" });
    expect(splitSymbol("BTCBRL")).toBeNull();
  });
});
