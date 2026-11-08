import { describe, expect, test } from "vitest";
import { testDb } from "../helpers/db";
import { users } from "@/db/schema";
import { defaultPrefs, factoryIndicatorVisual, factoryVisualStyles, indicatorVisual, MAX_FAVORITE_SYMBOLS, sanitizePrefs, visualStyles, withIndicatorVisual } from "@/lib/charts/workspace";
import { DEFAULT_FIB_LEVELS } from "@/lib/charts/drawing";
import { getChartPrefs, saveChartPrefs } from "@/lib/charts/store";
import { sortPickItems } from "@/lib/charts/pick";
import { CROSS_PAIRS, crossPair, instrumentLabel, isSyntheticPair, ratioCandles } from "@/lib/market/ids";

const prefs = (favoriteSymbols: unknown) => sanitizePrefs({ ...defaultPrefs(), favoriteSymbols });

describe("pares favoritos (preferência da conta)", () => {
  test("guarda o identificador do instrumento, sem repetição; recusa lixo; respeita o limite", () => {
    const r = prefs(["ETHBTC", "BTCUSDT", "ETHBTC", "BTCETH", "XLMBTC", "TOTAL3", "<script>", "btcusdt", 42, "ETH/BTC"]);
    expect(r.ok && r.value.favoriteSymbols).toEqual(["ETHBTC", "BTCUSDT", "BTCETH", "XLMBTC", "TOTAL3"]);
    const many = Array.from({ length: MAX_FAVORITE_SYMBOLS + 20 }, (_, i) => `A${i}USDT`);
    const big = prefs(many);
    expect(big.ok && big.value.favoriteSymbols?.length).toBe(MAX_FAVORITE_SYMBOLS);
    // Preferências antigas (sem o campo) continuam válidas.
    const old = prefs(undefined);
    expect(old.ok && old.value.favoriteSymbols).toEqual([]);
  });

  test("ETH/BTC e BTC/ETH (sintético) são favoritos diferentes", () => {
    const r = prefs(["ETHBTC", "BTCETH"]);
    expect(r.ok && r.value.favoriteSymbols).toEqual(["ETHBTC", "BTCETH"]);
  });

  test("salvos por conta: sobrevivem a nova leitura (novo login) e não aparecem para outra conta", () => {
    const db = testDb();
    const mk = (u: string) => db.insert(users).values({ username: u, passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0].id;
    const ana = mk("ana");
    const bia = mk("bia");
    expect(saveChartPrefs(db, ana, { ...defaultPrefs(), favoriteSymbols: ["SOLUSDT", "TAOBTC"] }, null)).toEqual({ ok: true });
    expect(getChartPrefs(db, ana).tools.favoriteSymbols).toEqual(["SOLUSDT", "TAOBTC"]);
    expect(getChartPrefs(db, bia).tools.favoriteSymbols).toEqual([]);
  });
});

describe("ordem do seletor de pares", () => {
  const items = ["DOGEUSDT", "BTCUSDT", "ZZZUSDT", "ETHUSDT", "AAAUSDT", "SOLUSDT"].map((id) => ({ id, base: id.replace("USDT", "") }));
  const ranks = { BTC: 1, ETH: 2, SOL: 5, DOGE: 8 };
  test("favoritos primeiro (maior capitalização antes) e depois os demais por capitalização; sem posição: alfabética no fim", () => {
    const out = sortPickItems(items, new Set(["DOGEUSDT", "SOLUSDT"]), ranks).map((x) => x.id);
    expect(out).toEqual(["SOLUSDT", "DOGEUSDT", "BTCUSDT", "ETHUSDT", "AAAUSDT", "ZZZUSDT"]);
  });
  test("sem capitalização disponível: alfabética (como antes)", () => {
    expect(sortPickItems(items, new Set(), {}).map((x) => x.id)).toEqual(["AAAUSDT", "BTCUSDT", "DOGEUSDT", "ETHUSDT", "SOLUSDT", "ZZZUSDT"]);
  });
});

describe("pares sintéticos XLM/BTC, TAO/BTC, AAVE/BTC", () => {
  test("nome com *, origem nos pares em USDT", () => {
    expect(Object.keys(CROSS_PAIRS)).toEqual(["XLMBTC", "TAOBTC", "AAVEBTC"]);
    expect(crossPair("TAOBTC")).toMatchObject({ numerator: "TAOUSDT", denominator: "BTCUSDT" });
    expect(instrumentLabel("XLMBTC", (s) => s)).toBe("XLM/BTC*");
    expect(instrumentLabel("BTCETH", (s) => s)).toBe("BTC/ETH*");
    expect(isSyntheticPair("AAVEBTC") && isSyntheticPair("USDTBTC") && !isSyntheticPair("ETHBTC")).toBe(true);
    expect(crossPair("toString")).toBeUndefined();
  });

  test("velas da razão: casadas pelo horário, abertura/fechamento exatos, máxima ≥ e mínima ≤ ambos", () => {
    const a = [
      { timestamp: 1, open: 10, high: 12, low: 9, close: 11 },
      { timestamp: 2, open: 11, high: 13, low: 10, close: 12 },
      { timestamp: 3, open: 12, high: 12, low: 12, close: 12 },
    ];
    const b = [
      { timestamp: 1, open: 100, high: 110, low: 90, close: 100 },
      { timestamp: 2, open: 100, high: 100, low: 100, close: 120 },
    ];
    const r = ratioCandles(a, b);
    expect(r.map((k) => k.timestamp)).toEqual([1, 2]);
    expect(r[0]).toMatchObject({ open: 0.1, close: 0.11 });
    expect(r[1]).toMatchObject({ open: 0.11, close: 0.1, high: 0.13, low: 0.1 });
    for (const k of r) expect(k.high >= Math.max(k.open, k.close) && k.low <= Math.min(k.open, k.close)).toBe(true);
  });
});

describe("padrões visuais por tipo (preferência da conta)", () => {
  test("só tipos conhecidos e só propriedades visuais; cores antigas da Faixa Fixa migram", () => {
    const r = sanitizePrefs({ ...defaultPrefs(), styleDefaults: { fibonacciLine: { color: "#2962ff", size: 2, mirror: true }, nope: { color: "#ffffff" } } });
    expect(r.ok && r.value.styleDefaults).toEqual({ fibonacciLine: { color: "#2962ff", size: 2 } });
    const old = sanitizePrefs({ ...defaultPrefs(), profileColors: { buyColor: "#7c3aedcc" } });
    expect(old.ok && old.value.styleDefaults).toEqual({ fixedRangeVolumeProfile: { buyColor: "#7c3aedcc" } });
  });

  test("por conta: uma conta não recebe os padrões da outra", () => {
    const db = testDb();
    const mk = (u: string) => db.insert(users).values({ username: u, passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0].id;
    const ana = mk("ana");
    const bia = mk("bia");
    saveChartPrefs(db, ana, { ...defaultPrefs(), indicatorDefaults: { RSI: { styles: { rsi1: { color: "#ff9800" } } } } }, null);
    expect(getChartPrefs(db, ana).tools.indicatorDefaults).toEqual({ RSI: { styles: { rsi1: { color: "#ff9800" } } } });
    expect(getChartPrefs(db, bia).tools.indicatorDefaults).toBeUndefined();
  });
});

describe("↶ Padrão: visual de fábrica", () => {
  test("desenho: tira só o visual; janela analisada, deslocamento e textos ficam; Fibonacci: só as cores dos níveis voltam", () => {
    const st = { color: "#2962ff", size: 3, style: "dashed" as const, buyColor: "#ff0000", histWidth: 200, windowFrom: 1, windowTo: 2, shiftBars: 4, labels: ["a"], levels: [{ value: 0.5, color: "#ff00ff", visible: false }] };
    const f = factoryVisualStyles(st, DEFAULT_FIB_LEVELS);
    expect(visualStyles(f)).toEqual({ levels: [{ value: 0.5, color: DEFAULT_FIB_LEVELS.find((l) => l.value === 0.5)!.color, visible: false }] });
    expect(f).toMatchObject({ windowFrom: 1, windowTo: 2, shiftBars: 4, labels: ["a"] });
  });

  test("indicador: tira cores/espessuras/traços; mantém períodos, visibilidade das séries e opções de cálculo", () => {
    const ind = { name: "DELTA", params: [14], pane: "sub" as const, styles: { a: { color: "#ff0000", size: 2, visible: false }, b: { color: "#00ff00" } }, options: { upColor: "#111111", mode: "line" as const } };
    expect(factoryIndicatorVisual(ind)).toEqual({ name: "DELTA", params: [14], pane: "sub", styles: { a: { visible: false } }, options: { mode: "line" } });
    expect(indicatorVisual(ind)).toEqual({ styles: { a: { color: "#ff0000", size: 2 }, b: { color: "#00ff00" } }, upColor: "#111111" });
    // Indicador novo com o padrão do tipo.
    expect(withIndicatorVisual({ name: "DELTA", params: [14], pane: "sub" }, indicatorVisual(ind))).toMatchObject({ styles: { a: { color: "#ff0000", size: 2 } }, options: { upColor: "#111111" } });
  });
});
