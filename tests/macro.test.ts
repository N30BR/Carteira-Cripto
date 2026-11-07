import { describe, expect, test } from "vitest";
import {
  dayMs,
  dxyFromUsdRates,
  dxySeries,
  lastChange,
  lastDecision,
  monthlyAverage,
  parseBojSeries,
  parseEcbCsv,
  parseFrankfurterSeries,
  pctChangeOver,
  sumByMonth,
  thin,
  toUsdTrillions,
  yoy,
  type Point,
} from "@/lib/macro/calc";
import { convertUsd, parseMacroPrefs } from "@/lib/macro/prefs";

const D = (iso: string) => dayMs(iso);

describe("fontes", () => {
  test("Frankfurter: série por moeda, em ordem, sem valores inválidos", () => {
    const fx = parseFrankfurterSeries({ rates: { "2026-11-06": { EUR: 0.9, BRL: 5.5 }, "2026-11-05": { EUR: 0.91, BRL: "x", XX: 1 }, lixo: { EUR: 1 } } });
    expect(fx.EUR).toEqual([
      [D("2026-11-05"), 0.91],
      [D("2026-11-06"), 0.9],
    ]);
    expect(fx.BRL).toEqual([[D("2026-11-06"), 5.5]]);
    expect(fx.XX).toBeUndefined();
    expect(() => parseFrankfurterSeries({ erro: 1 })).toThrow();
  });
  test("Banco do Japão: datas mensais e diárias; nulos ignorados", () => {
    const j = { RESULTSET: [{ VALUES: { SURVEY_DATES: [202501, 202502, 20260903], VALUES: [10, null, 0.477] } }] };
    expect(parseBojSeries(j)).toEqual([
      [D("2025-01-01"), 10],
      [D("2026-09-03"), 0.477],
    ]);
    expect(() => parseBojSeries({})).toThrow();
  });
  test("BCE (CSV): TIME_PERIOD e OBS_VALUE", () => {
    const csv = "KEY,TIME_PERIOD,OBS_VALUE\nA,2026-08,16000000\nB,2026-09,\nC,2026-09,16100000";
    expect(parseEcbCsv(csv)).toEqual([
      [D("2026-08-01"), 16_000_000],
      [D("2026-09-01"), 16_100_000],
    ]);
    expect(() => parseEcbCsv("a,b\n1,2")).toThrow();
  });
});

describe("DXY pela fórmula da ICE", () => {
  test("com as taxas de 06/11/2026 do BCE fica na faixa esperada e sobe quando o dólar se fortalece", () => {
    const r = { EUR: 0.89566, JPY: 158.33, GBP: 0.74711, CAD: 1.4066, SEK: 9.8755, CHF: 0.8189 };
    const v = dxyFromUsdRates(r);
    expect(v).toBeGreaterThan(90);
    expect(v).toBeLessThan(115);
    expect(dxyFromUsdRates({ ...r, EUR: r.EUR * 1.02 })).toBeGreaterThan(v);
  });
  test("série só nos dias com as 6 moedas", () => {
    const one = (v: number): Point[] => [[D("2026-11-05"), v], [D("2026-11-06"), v]];
    const fx = { EUR: one(0.9), JPY: one(150), GBP: one(0.75), CAD: one(1.4), SEK: one(10), CHF: [[D("2026-11-06"), 0.8]] as Point[] };
    expect(dxySeries(fx).map((p) => p[0])).toEqual([D("2026-11-06")]);
  });
});

describe("variações", () => {
  const s: Point[] = [
    [D("2025-11-06"), 100],
    [D("2026-10-07"), 110],
    [D("2026-11-05"), 118],
    [D("2026-11-06"), 120],
  ];
  test("por período, a partir do último ponto; histórico curto → null", () => {
    expect(pctChangeOver(s, 365)).toBeCloseTo(20);
    expect(pctChangeOver(s, 30)).toBeCloseTo((120 / 110 - 1) * 100);
    expect(pctChangeOver(s, 500)).toBeNull();
  });
  test("última variação em % ou diferença (p.p.)", () => {
    expect(lastChange(s, "diff")).toBe(2);
    expect(lastChange(s, "pct")).toBeCloseTo((120 / 118 - 1) * 100);
    expect(lastChange([[1, 1]], "pct")).toBeNull();
  });
  test("última decisão (série em degraus) e taxa de mercado com ruído", () => {
    const fed: Point[] = [[1, 4.5], [2, 4.5], [3, 4.25], [4, 4.25], [5, 4.0], [6, 4.0]];
    expect(lastDecision(fed)).toEqual({ at: 5, change: -0.25 });
    const call: Point[] = [[1, 0.227], [2, 0.231], [3, 0.477], [4, 0.476], [5, 0.48]];
    expect(lastDecision(call, 0.1)).toEqual({ at: 3, change: expect.closeTo(0.249, 5) });
    expect(lastDecision([[1, 2], [2, 2]])).toBeNull();
  });
  test("minigráfico leve: no máximo N pontos, com o último", () => {
    const many = Array.from({ length: 1000 }, (_, i) => [i, i] as Point);
    const t = thin(many, 100);
    expect(t).toHaveLength(100);
    expect(t.at(-1)).toEqual([999, 999]);
  });
});

describe("M2 em US$", () => {
  test("converte pela média do mês; mês sem câmbio fica de fora; soma só meses completos; a/a", () => {
    const jpy = monthlyAverage([
      [D("2026-08-03"), 150],
      [D("2026-08-04"), 160],
      [D("2025-08-04"), 140],
    ]);
    expect(jpy.get("2026-08")).toBe(155);
    // 1.000.000 × 100 milhões de ienes = 1e14 ienes ÷ 155 = ~0,645 tri US$
    const jp = toUsdTrillions([[D("2026-08-01"), 1_000_000], [D("2026-09-01"), 1_000_000]], 1e8, jpy);
    expect(jp).toEqual([[D("2026-08-01"), expect.closeTo(1e14 / 155 / 1e12, 9)]]);
    const us = toUsdTrillions([[D("2026-08-01"), 22000], [D("2026-09-01"), 22100]], 1e9, null);
    expect(sumByMonth([us, jp]).map((p) => p[0])).toEqual([D("2026-08-01")]);
    expect(yoy([[D("2025-08-01"), 100], [D("2026-08-01"), 105]])).toBeCloseTo(5);
    expect(yoy([[D("2026-08-01"), 105]])).toBeNull();
  });
});

describe("Ativos Principais: moeda e preferências", () => {
  const usdIn = { EUR: 0.9, JPY: 150, BRL: 5.5, BTC: 1 / 100_000 };
  test("conversão só do preço; sem cotação não inventa", () => {
    expect(convertUsd(4000, "USD", usdIn)).toBe(4000);
    expect(convertUsd(4000, "BRL", usdIn)).toBe(22000);
    expect(convertUsd(4000, "BTC", usdIn)).toBeCloseTo(0.04);
    expect(convertUsd(4000, "EUR", { ...usdIn, EUR: null })).toBeNull();
    expect(convertUsd(null, "EUR", usdIn)).toBeNull();
  });
  test("cookie: só valores conhecidos (padrão 1M e USD)", () => {
    const base = { fx: "1D", indicators: "1D", markets: "1D", assets: "1D" };
    expect(parseMacroPrefs(undefined)).toEqual({ period: "1M", currency: "USD", ...base });
    expect(parseMacroPrefs(JSON.stringify({ period: "3M", currency: "BTC" }))).toEqual({ period: "3M", currency: "BTC", ...base });
    expect(parseMacroPrefs(JSON.stringify({ fx: "6M", markets: "3M" }))).toMatchObject({ fx: "6M", markets: "1D" });
    expect(parseMacroPrefs(JSON.stringify({ period: "10A", currency: "GBP" }))).toEqual({ period: "1M", currency: "USD", ...base });
    expect(parseMacroPrefs("{lixo")).toEqual({ period: "1M", currency: "USD", ...base });
  });
});
