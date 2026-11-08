import { describe, expect, test } from "vitest";
import {
  CHART_INDICATORS,
  CHART_TOOLS,
  LIMITS,
  defaultPane,
  DEFAULT_INTERVALS,
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
    const known = CHART_TOOLS.map((t) => t.name);
    expect(sanitizePrefs({ visible: ["segment", "segment", "fibonacciLine", "hack"], favorites: ["fibonacciLine", "priceLine"], known })).toEqual({
      ok: true,
      value: { visible: ["segment", "fibonacciLine", "priceLine"], favorites: ["fibonacciLine", "priceLine"], intervals: DEFAULT_INTERVALS, favoriteIndicators: [], favoriteSymbols: [], known },
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

describe("estilo, visibilidade e bloqueio dos desenhos", () => {
  const pt = { timestamp: 1, value: 1 };
  const one = (o: object) => sanitizeTabState({ layout: 1, panes: [{ ...defaultPane(), overlays: [{ name: "segment", points: [pt, pt], ...o }] }] });

  test("guarda id, cor, espessura, traço, extensão, oculto e bloqueado", () => {
    const r = one({ id: "d-1", visible: false, locked: true, styles: { color: "#f59e0b", size: 2, style: "dotted", textColor: "#ffffff", extend: "right" } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.panes[0].overlays[0]).toMatchObject({ id: "d-1", visible: false, locked: true, styles: { color: "#f59e0b", size: 2, style: "dotted", extend: "right" } });
  });

  test("recusa cor fora do formato #rrggbb(aa), espessura absurda, traço ou id inválidos", () => {
    expect(one({ styles: { color: "red;background:url(x)" } }).ok).toBe(false);
    expect(one({ styles: { size: 99 } }).ok).toBe(false);
    expect(one({ styles: { style: "wavy" } }).ok).toBe(false);
    expect(one({ styles: { extend: "up" } }).ok).toBe(false);
    expect(one({ id: "<img>" }).ok).toBe(false);
    expect(one({ visible: "no" }).ok).toBe(false);
  });

  test("Fibonacci: níveis com valor, cor e visibilidade (até 24)", () => {
    const fib = (levels: unknown) =>
      sanitizeTabState({ layout: 1, panes: [{ ...defaultPane(), overlays: [{ name: "fibonacciLine", points: [pt, pt], styles: { levels } }] }] });
    expect(fib([{ value: 0.618, color: "#22c55e", visible: true }]).ok).toBe(true);
    expect(fib([{ value: "x", color: "#22c55e", visible: true }]).ok).toBe(false);
    expect(fib(Array.from({ length: 25 }, () => ({ value: 1, color: "#ffffff", visible: true }))).ok).toBe(false);
  });

  test("novas ferramentas: canal paralelo e perfil de volume de faixa fixa", () => {
    expect(CHART_TOOLS.map((t) => t.name)).toEqual(expect.arrayContaining(["parallelChannel", "fixedRangeVolumeProfile"]));
  });
});

describe("indicadores: estilo por série, legenda, visibilidade e painel", () => {
  const one = (o: object) => sanitizeTabState({ layout: 1, panes: [{ ...defaultPane(), indicators: [{ name: "MA_RIBBON", params: [10, 30], pane: "main", ...o }] }] });

  test("guarda id, visível, painel agrupado, estilos por série e o que esconder da legenda", () => {
    const r = one({
      id: "i-1",
      visible: false,
      paneKey: "p-2",
      styles: { e0: { color: "#ffcc80", size: 2, style: "dashed", visible: false } },
      legend: { name: false, params: true, values: false },
      options: { types: ["EMA", "SMA"] },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.panes[0].indicators[0]).toMatchObject({ id: "i-1", visible: false, paneKey: "p-2", legend: { name: false, values: false }, options: { types: ["EMA", "SMA"] } });
  });

  test("recusa chave de série, cor, tipo de média e painel inválidos", () => {
    expect(one({ styles: { "__proto__x": { color: "#fff" } } }).ok).toBe(false);
    expect(one({ styles: { e0: { color: "url(x)" } } }).ok).toBe(false);
    expect(one({ options: { types: ["HMA"] } }).ok).toBe(false);
    expect(one({ paneKey: "a b" }).ok).toBe(false);
    expect(one({ legend: { name: "no" } }).ok).toBe(false);
  });
});

describe("comparações: sobre o preço ou em painel separado", () => {
  test("display main/sub opcional", () => {
    const r = sanitizeTabState({ layout: 1, panes: [{ ...defaultPane(), compares: [{ kind: "pair", id: "ETHUSDT", display: "sub" }] }] });
    expect(r.ok && r.value.panes[0].compares[0]).toEqual({ kind: "pair", id: "ETHUSDT", display: "sub" });
    expect(sanitizeTabState({ layout: 1, panes: [{ ...defaultPane(), compares: [{ kind: "pair", id: "ETHUSDT", display: "x" }] }] }).ok).toBe(false);
  });
});

describe("preferências: tempos da barra e indicadores favoritos", () => {
  test("até 8 tempos conhecidos, na ordem do menor para o maior; indicadores favoritos só conhecidos", () => {
    const known = CHART_TOOLS.map((t) => t.name);
    const r = sanitizePrefs({ visible: [], favorites: [], intervals: ["1M", "1m", "1M", "6M", "x"], favoriteIndicators: ["RSI", "HACK", "RSI"], known });
    expect(r).toEqual({ ok: true, value: { visible: [], favorites: [], intervals: ["1m", "1M", "6M"], favoriteIndicators: ["RSI"], favoriteSymbols: [], known } });
    const many = sanitizePrefs({ visible: [], favorites: [], intervals: ["1m", "5m", "15m", "30m", "1h", "4h", "6h", "12h", "1d"] });
    expect(many.ok && many.value.intervals).toHaveLength(8);
  });

  test("preferências antigas (sem tempos) recebem os padrões; lista vazia também", () => {
    const r = sanitizePrefs({ visible: ["segment"], favorites: [] });
    expect(r.ok && r.value.intervals).toEqual(DEFAULT_INTERVALS);
    const empty = sanitizePrefs({ visible: [], favorites: [], intervals: [] });
    expect(empty.ok && empty.value.intervals).toEqual(DEFAULT_INTERVALS);
  });
});

describe("níveis de referência do RSI e novas ferramentas", () => {
  test("níveis entre 0 e 100, no máximo 5; VWAP ancorado é uma ferramenta", () => {
    const one = (levels: unknown) =>
      sanitizeTabState({ layout: 1, panes: [{ ...defaultPane(), indicators: [{ name: "RSI", params: [14], pane: "sub", options: { levels } }] }] });
    const r = one([30, 50, 70]);
    expect(r.ok && r.value.panes[0].indicators[0].options).toEqual({ levels: [30, 50, 70] });
    expect(one([101]).ok).toBe(false);
    expect(one([1, 2, 3, 4, 5, 6]).ok).toBe(false);
    expect(one(["x"]).ok).toBe(false);
    expect(CHART_TOOLS.map((t) => t.name)).toContain("anchoredVwap");
  });
});

describe("ferramentas novas aparecem para quem já tinha preferências salvas", () => {
  test("preferências antigas (sem 'known'): ferramentas criadas depois entram como visíveis", () => {
    const r = sanitizePrefs({ visible: ["segment"], favorites: [] });
    expect(r.ok && r.value.visible).toEqual(expect.arrayContaining(["segment", "parallelChannel", "fixedRangeVolumeProfile", "anchoredVwap"]));
    expect(r.ok && r.value.visible).not.toContain("rectangle"); // escondida pela pessoa continua escondida
  });
  test("com 'known': só o que não existia ainda entra; o que a pessoa escondeu continua escondido", () => {
    const r = sanitizePrefs({ visible: ["segment"], favorites: [], known: CHART_TOOLS.map((t) => t.name).filter((n) => n !== "anchoredVwap") });
    expect(r.ok && r.value.visible).toEqual(["segment", "anchoredVwap"]);
    expect(r.ok && r.value.known).toEqual(CHART_TOOLS.map((t) => t.name));
  });
});

describe("comparações on-chain e aparência das comparações", () => {
  const cmp = (c: unknown) => sanitizeTabState({ layout: 1, panes: [{ ...defaultPane(), compares: [c] }] });
  test("aceita indicadores on-chain conhecidos com cor, espessura e visibilidade", () => {
    const r = cmp({ kind: "onchain", id: "NUPL", display: "sub", color: "#22c55e", size: 2, visible: false });
    expect(r.ok && r.value.panes[0].compares[0]).toEqual({ kind: "onchain", id: "NUPL", display: "sub", color: "#22c55e", size: 2, visible: false });
  });
  test("recusa on-chain desconhecido, cor e espessura inválidas", () => {
    expect(cmp({ kind: "onchain", id: "HACK" }).ok).toBe(false);
    expect(cmp({ kind: "onchain", id: "NUPL", color: "red" }).ok).toBe(false);
    expect(cmp({ kind: "pair", id: "ETHUSDT", size: 50 }).ok).toBe(false);
    expect(cmp({ kind: "pair", id: "ETHUSDT", visible: "x" }).ok).toBe(false);
  });
});
