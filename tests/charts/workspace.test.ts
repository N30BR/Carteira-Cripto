import { describe, expect, test } from "vitest";
import {
  CHART_INDICATORS,
  CHART_TOOLS,
  LIMITS,
  defaultPane,
  defaultTab,
  sanitizePrefs,
  sanitizeTabState,
} from "@/lib/charts/workspace";

describe("estado de uma aba de gráficos", () => {
  test("aba padrão: 1 divisão com BTCUSDT 1D em velas", () => {
    expect(defaultTab()).toEqual({ layout: 1, panes: [defaultPane()] });
    expect(defaultPane()).toMatchObject({ symbol: "BTCUSDT", interval: "1d", chartType: "candle", scale: "normal" });
  });

  test("aceita um estado válido e completa as divisões que faltarem para o layout", () => {
    const r = sanitizeTabState({
      layout: 4,
      panes: [
        {
          symbol: "ETHBTC",
          interval: "4h",
          chartType: "area",
          scale: "logarithm",
          indicators: [{ name: "EMA", params: [10, 30, 50, 100], pane: "main" }, { name: "RSI_DIV", params: [14], pane: "sub" }],
          overlays: [{ name: "segment", points: [{ timestamp: 1, value: 10 }, { timestamp: 2, value: 20 }] }],
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.panes).toHaveLength(4);
    expect(r.value.panes[0]).toMatchObject({ symbol: "ETHBTC", scale: "logarithm" });
    expect(r.value.panes[3]).toEqual(defaultPane());
  });

  test("recusa layout, par, tempo, tipo e escala inválidos", () => {
    const bad = (p: object, layout = 1) => sanitizeTabState({ layout, panes: [{ ...defaultPane(), ...p }] }).ok;
    expect(sanitizeTabState({ layout: 3, panes: [] }).ok).toBe(false);
    expect(bad({ symbol: "<script>" })).toBe(false);
    expect(bad({ symbol: "BTCBRL" })).toBe(false);
    expect(bad({ interval: "2h" })).toBe(false);
    expect(bad({ chartType: "pizza" })).toBe(false);
    expect(bad({ scale: "x" })).toBe(false);
    expect(sanitizeTabState("x").ok).toBe(false);
    expect(sanitizeTabState(null).ok).toBe(false);
  });

  test("indicadores: só os conhecidos, parâmetros numéricos e limite por gráfico (bem acima de 15)", () => {
    expect(CHART_INDICATORS.length).toBeGreaterThanOrEqual(30);
    expect(LIMITS.indicatorsPerPane).toBeGreaterThanOrEqual(40);
    const pane = (indicators: unknown[]) => sanitizeTabState({ layout: 1, panes: [{ ...defaultPane(), indicators }] }).ok;
    expect(pane([{ name: "HACK", params: [], pane: "main" }])).toBe(false);
    expect(pane([{ name: "MA", params: ["5"], pane: "main" }])).toBe(false);
    expect(pane([{ name: "MA", params: [Number.NaN], pane: "main" }])).toBe(false);
    expect(pane([{ name: "MA", params: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], pane: "main" }])).toBe(false);
    expect(pane([{ name: "MA", params: [5], pane: "lado" }])).toBe(false);
    expect(pane(Array.from({ length: 20 }, () => ({ name: "MA", params: [5], pane: "main" })))).toBe(true);
    expect(pane(Array.from({ length: LIMITS.indicatorsPerPane + 1 }, () => ({ name: "MA", params: [5], pane: "main" })))).toBe(false);
  });

  test("desenhos: só ferramentas conhecidas, pontos numéricos, texto curto e limite por gráfico", () => {
    const pane = (overlays: unknown[]) => sanitizeTabState({ layout: 1, panes: [{ ...defaultPane(), overlays }] }).ok;
    const pt = { timestamp: 1, value: 1 };
    expect(pane([{ name: "fibonacciLine", points: [pt, pt] }])).toBe(true);
    expect(pane([{ name: "simpleAnnotation", points: [pt], text: "Topo" }])).toBe(true);
    expect(pane([{ name: "rm -rf", points: [pt] }])).toBe(false);
    expect(pane([{ name: "segment", points: [{ timestamp: "1", value: 1 }] }])).toBe(false);
    expect(pane([{ name: "segment", points: Array.from({ length: 11 }, () => pt) }])).toBe(false);
    expect(pane([{ name: "simpleAnnotation", points: [pt], text: "x".repeat(201) }])).toBe(false);
    expect(pane(Array.from({ length: LIMITS.overlaysPerPane + 1 }, () => ({ name: "segment", points: [pt] })))).toBe(false);
  });
});

describe("preferências das ferramentas", () => {
  test("visíveis e favoritas: só ferramentas conhecidas, sem repetição; favoritas também visíveis", () => {
    expect(CHART_TOOLS.length).toBeGreaterThanOrEqual(15);
    expect(sanitizePrefs({ visible: ["segment", "segment", "fibonacciLine", "hack"], favorites: ["fibonacciLine", "priceLine"] })).toEqual({
      ok: true,
      value: { visible: ["segment", "fibonacciLine", "priceLine"], favorites: ["fibonacciLine", "priceLine"] },
    });
    expect(sanitizePrefs("x").ok).toBe(false);
  });
});

describe("comparações por gráfico", () => {
  const withCompares = (compares: unknown) => sanitizeTabState({ layout: 1, panes: [{ ...defaultPane(), compares }] });

  test("pares cripto (USDT/BTC/ETH) e séries macro conhecidas", () => {
    const r = withCompares([
      { kind: "pair", id: "PAXGUSDT" },
      { kind: "macro", id: "GLOBAL_LIQUIDITY" },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.panes[0].compares).toHaveLength(2);
    expect(withCompares(undefined).ok).toBe(true); // estados antigos, sem comparações
  });

  test("recusa tipo, par ou série desconhecidos e mais de 10 comparações", () => {
    expect(withCompares([{ kind: "x", id: "BTCUSDT" }]).ok).toBe(false);
    expect(withCompares([{ kind: "pair", id: "BTCBRL" }]).ok).toBe(false);
    expect(withCompares([{ kind: "macro", id: "HACK" }]).ok).toBe(false);
    expect(withCompares("x").ok).toBe(false);
    expect(withCompares(Array.from({ length: 11 }, () => ({ kind: "pair", id: "ETHUSDT" }))).ok).toBe(false);
  });
});

describe("revisão: parâmetros de indicador", () => {
  test("parâmetros precisam ser positivos (zero ou negativo quebrariam os cálculos)", () => {
    const pane = (params: number[]) => sanitizeTabState({ layout: 1, panes: [{ ...defaultPane(), indicators: [{ name: "MA", params, pane: "main" }] }] }).ok;
    expect(pane([5, 10])).toBe(true);
    expect(pane([2.5])).toBe(true);
    expect(pane([0])).toBe(false);
    expect(pane([-5])).toBe(false);
  });
});
