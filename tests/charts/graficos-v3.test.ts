import { describe, expect, test } from "vitest";
import { movingAverage, priceSource, rma, volumeProfile, wma } from "@/lib/charts/indicators";
import { DEFAULT_FIB_LEVELS, NEO_COLORS } from "@/lib/charts/drawing";
import { compareDisplay, compareScale } from "@/lib/charts/compare";
import { CHART_INDICATORS, CHART_TOOLS, ELLIOTT_LABELS, sanitizeTabState, type TabState } from "@/lib/charts/workspace";

const bar = (o: number, h: number, l: number, c: number, volume: number, buyVolume?: number) => ({ timestamp: 0, open: o, high: h, low: l, close: c, volume, ...(buyVolume === undefined ? {} : { buyVolume }) });

describe("médias do MA Ribbon NEO", () => {
  test("WMA, RMA e o seletor de método", () => {
    expect(wma([1, 2, 3], 3)).toEqual([null, null, (1 + 4 + 9) / 6]);
    expect(rma([2, 4, 6, 8], 2)).toEqual([null, 3, 4.5, 6.25]);
    expect(movingAverage([1, 2, 3, 4], 2, "SMA")).toEqual([null, 1.5, 2.5, 3.5]);
    expect(movingAverage([1, 2, 3, 4], 2, "WMA")).toEqual(wma([1, 2, 3, 4], 2));
  });
  test("fonte do preço", () => {
    const b = [{ timestamp: 0, open: 1, high: 4, low: 0, close: 3 }];
    expect(priceSource(b, "hl2")).toEqual([2]);
    expect(priceSource(b, "ohlc4")).toEqual([2]);
    expect(priceSource(b)).toEqual([3]);
  });
  test("indicador único com oito médias padrão (25 a 50, 100 e 200)", () => {
    expect(CHART_INDICATORS.find((i) => i.name === "MA_RIBBON_NEO")?.params).toEqual([25, 30, 35, 40, 45, 50, 100, 200]);
    expect(NEO_COLORS).toHaveLength(8);
  });
});

describe("Volume Profile com compras e vendas", () => {
  test("usa o volume comprador real da vela e reparte por faixa", () => {
    const vp = volumeProfile([bar(10, 12, 10, 11, 100, 70)], 0, 0, 2);
    expect(vp.sideEstimated).toBe(false);
    expect(vp.bins.map((b) => b.buy)).toEqual([35, 35]);
    expect(vp.bins.map((b) => b.sell)).toEqual([15, 15]);
    expect(vp.bins.every((b) => Math.abs(b.buy + b.sell - b.volume) < 1e-9)).toBe(true);
  });
  test("sem volume comprador, a divisão é estimada e marcada", () => {
    const vp = volumeProfile([bar(10, 12, 10, 12, 100)], 0, 0, 1);
    expect(vp.sideEstimated).toBe(true);
    expect(vp.bins[0].buy).toBe(100);
  });
});

describe("Fibonacci com as cores das médias", () => {
  test("mesmos níveis de antes, cores novas", () => {
    expect(DEFAULT_FIB_LEVELS.map((l) => l.value)).toEqual([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]);
    expect(DEFAULT_FIB_LEVELS.map((l) => l.color)).toEqual(NEO_COLORS.slice(0, 7));
  });
});

describe("comparações", () => {
  test("on-chain começa sobre o preço; escala própria fora do BTCUSDT ou fora de US$", () => {
    expect(compareDisplay({ kind: "onchain", id: "NUPL" })).toBe("main");
    expect(compareScale({ kind: "onchain", id: "NUPL" }, "BTCUSDT")).toBe("fit");
    expect(compareScale({ kind: "onchain", id: "REALIZED_PRICE" }, "BTCUSDT")).toBe("price");
    expect(compareScale({ kind: "onchain", id: "REALIZED_PRICE" }, "ETHUSDT")).toBe("fit");
    expect(compareScale({ kind: "pair", id: "PAXGUSDT" }, "BTCUSDT")).toBe("percent");
    expect(compareDisplay({ kind: "onchain", id: "NUPL", display: "sub" })).toBe("sub");
  });
});

describe("ondas de Elliott e raios paralelos", () => {
  test("cada ferramenta tem a quantidade certa de ondas (pontos = ondas + origem)", () => {
    expect(Object.fromEntries(Object.entries(ELLIOTT_LABELS).map(([k, v]) => [k, v.join("")]))).toEqual({
      elliottImpulse: "12345",
      elliottCorrection: "ABC",
      elliottTriangle: "ABCDE",
      elliottDoubleCombo: "WXY",
      elliottTripleCombo: "WXYXZ",
    });
    for (const n of [...Object.keys(ELLIOTT_LABELS), "parallelRays"]) expect(CHART_TOOLS.some((t) => t.name === n)).toBe(true);
  });
  const withOverlay = (styles: Record<string, unknown>) =>
    sanitizeTabState({ layout: 1, panes: [{ symbol: "BTCUSDT", interval: "1d", chartType: "candle", scale: "normal", indicators: [], compares: [], overlays: [{ name: "elliottTripleCombo", points: [], styles }] }] });
  test("opções dos rótulos validadas", () => {
    expect(withOverlay({ buyColor: "#22c55e", sellColor: "#ef4444cc", labelSize: 14, showLabels: false, showPoints: true, labels: ["(1)", "", "Y", "X2", "Z"], labelPosition: "above" }).ok).toBe(true);
    expect(withOverlay({ labelSize: 100 }).ok).toBe(false);
    expect(withOverlay({ labels: ["<img>"] }).ok).toBe(false);
    expect(withOverlay({ labels: ["a\nb"] }).ok).toBe(false);
    expect(withOverlay({ labels: ["1", "2", "3", "4", "5", "6"] }).ok).toBe(false);
    expect(withOverlay({ labelPosition: "left" }).ok).toBe(false);
    expect(withOverlay({ showPoints: "sim" }).ok).toBe(false);
  });
});

describe("estado salvo: novos campos validados", () => {
  const base = (pane: Record<string, unknown>): TabState =>
    ({ layout: 1, panes: [{ symbol: "BTCUSDT", interval: "1d", chartType: "candle", scale: "normal", indicators: [], overlays: [], compares: [], ...pane }] }) as never;
  test("aceita os válidos", () => {
    const r = sanitizeTabState(
      base({
        legendCollapsed: true,
        showOhlc: false,
        indicators: [{ name: "MA_RIBBON_NEO", params: [25, 30, 35, 40, 45, 50, 100, 200], pane: "main", options: { source: "hlc3", types: ["SMA", "RMA"] } }, { name: "DELTA", params: [], pane: "sub", options: { upColor: "#00ff00", downColor: "#ff000080", mode: "line" } }],
        overlays: [{ name: "fixedRangeVolumeProfile", points: [], styles: { buyColor: "#22c55e", sellColor: "#ef444480" } }],
        compares: [{ kind: "onchain", id: "NUPL", scale: "fit", style: "dashed" }],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.panes[0].legendCollapsed).toBe(true);
      expect(r.value.panes[0].showOhlc).toBe(false);
      expect(r.value.panes[0].compares[0]).toMatchObject({ scale: "fit", style: "dashed" });
    }
  });
  test("recusa os inválidos", () => {
    expect(sanitizeTabState(base({ showOhlc: "não" })).ok).toBe(false);
    expect(sanitizeTabState(base({ compares: [{ kind: "pair", id: "PAXGUSDT", scale: "log" }] })).ok).toBe(false);
    expect(sanitizeTabState(base({ indicators: [{ name: "DELTA", params: [], pane: "sub", options: { mode: "pizza" } }] })).ok).toBe(false);
    expect(sanitizeTabState(base({ indicators: [{ name: "DELTA", params: [], pane: "sub", options: { upColor: "red" } }] })).ok).toBe(false);
    expect(sanitizeTabState(base({ overlays: [{ name: "fixedRangeVolumeProfile", points: [], styles: { buyColor: "url(x)" } }] })).ok).toBe(false);
    expect(sanitizeTabState(base({ indicators: [{ name: "MA", params: [5], pane: "main", options: { source: "volume" } }] })).ok).toBe(false);
  });
});
