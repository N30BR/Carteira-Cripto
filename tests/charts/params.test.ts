import { describe, expect, test } from "vitest";
import { CHART_INTERVALS, CHART_QUOTES, aggregateCandles, parseCandleQuery, splitSymbol } from "@/lib/charts/params";

describe("parâmetros das velas", () => {
  test("tempos aceitos e cotações USDT/BTC/ETH", () => {
    expect(CHART_INTERVALS).toEqual(["1m", "5m", "15m", "30m", "1h", "4h", "6h", "12h", "1d", "3d", "1w", "1M", "6M", "1y"]);
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
    expect(bad("symbol=BTCUSDT&interval=6m")).toBe(false); // 6m (minutos) não existe; 6M (meses) sim
    expect(bad("symbol=BTCUSDT&interval=6M")).toBe(true);
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

describe("velas de 6 meses e 1 ano (montadas a partir das mensais)", () => {
  const m = (y: number, mo: number, o: number, h: number, l: number, c: number, v: number, buy?: number) => ({
    timestamp: Date.UTC(y, mo, 1), open: o, high: h, low: l, close: c, volume: v, ...(buy === undefined ? {} : { buyVolume: buy }),
  });
  const months = [m(2024, 4, 10, 12, 9, 11, 1, 1), m(2024, 5, 11, 15, 10, 14, 2, 1), m(2024, 6, 14, 14, 8, 9, 3, 2), m(2024, 11, 9, 20, 9, 19, 4, 1), m(2025, 0, 19, 21, 18, 20, 5, 3)];

  test("semestres: jan–jun e jul–dez, com abertura da 1ª, fechamento da última, máxima, mínima e volumes somados", () => {
    expect(aggregateCandles(months, "6M")).toEqual([
      { timestamp: Date.UTC(2024, 0, 1), open: 10, high: 15, low: 9, close: 14, volume: 3, buyVolume: 2 },
      { timestamp: Date.UTC(2024, 6, 1), open: 14, high: 20, low: 8, close: 19, volume: 7, buyVolume: 3 },
      { timestamp: Date.UTC(2025, 0, 1), open: 19, high: 21, low: 18, close: 20, volume: 5, buyVolume: 3 },
    ]);
  });

  test("anos", () => {
    const y = aggregateCandles(months, "1y");
    expect(y.map((c) => c.timestamp)).toEqual([Date.UTC(2024, 0, 1), Date.UTC(2025, 0, 1)]);
    expect(y[0]).toMatchObject({ open: 10, high: 20, low: 8, close: 19, volume: 10 });
  });

  test("sem compra agressora em alguma mensal: o período fica sem esse dado (não inventa)", () => {
    const r = aggregateCandles([m(2024, 0, 1, 2, 1, 2, 1, 1), m(2024, 1, 2, 3, 2, 3, 1)], "6M");
    expect(r[0].buyVolume).toBeUndefined();
  });
});
