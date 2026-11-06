import { describe, expect, test } from "vitest";
import { fromLog, logRange, logTickValues, toLog } from "@/lib/charts/log-axis";

describe("escala logarítmica", () => {
  test("log10 do preço; preços pequenos (abaixo de 1) também ficam proporcionais", () => {
    expect(toLog(100)).toBeCloseTo(2);
    expect(fromLog(toLog(0.35))).toBeCloseTo(0.35);
    // 0,1 → 0,2 ocupa a mesma altura que 100 → 200 (com log(1 + x) não ocupava)
    expect(toLog(0.2) - toLog(0.1)).toBeCloseTo(toLog(200) - toLog(100));
    expect(Number.isFinite(toLog(0))).toBe(true);
    expect(Number.isFinite(toLog(-5))).toBe(true);
  });

  test("faixa: os campos que o gráfico desloca ao arrastar ficam em log (arrastar não muda a proporção)", () => {
    const r = logRange(toLog(1000), toLog(10000));
    expect(r.from).toBeCloseTo(3);
    expect(r.to).toBeCloseTo(4);
    expect(r.realRange).toBeCloseTo(1);
    expect(r.displayFrom).toBeCloseTo(1000);
    expect(r.displayTo).toBeCloseTo(10000);
    // arrastar = somar o mesmo valor em from/to; a altura em log (proporção entre preços) não muda
    const moved = logRange(r.from + 0.3, r.to + 0.3);
    expect(moved.realRange).toBeCloseTo(r.realRange);
    expect(moved.displayTo / moved.displayFrom).toBeCloseTo(r.displayTo / r.displayFrom);
  });

  test("marcações por década (1, 2, 5 × 10ⁿ) dentro da faixa", () => {
    expect(logTickValues(1, 1000)).toEqual([1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]);
    expect(logTickValues(0.03, 0.4)).toEqual([0.05, 0.1, 0.2]);
    expect(logTickValues(10, 5)).toEqual([]);
  });
});
