import { describe, expect, test } from "vitest";
import { DEFAULT_FIB_LEVELS, fibPrice, findBarIndex } from "@/lib/charts/drawing";

describe("Fibonacci: primeiro clique = nível 1, segundo clique = nível 0", () => {
  test("de topo para fundo: 1 no topo, 0 no fundo", () => {
    const top = 100;
    const bottom = 0;
    expect(fibPrice(top, bottom, 1)).toBe(100);
    expect(fibPrice(top, bottom, 0)).toBe(0);
    expect(fibPrice(top, bottom, 0.618)).toBeCloseTo(61.8);
  });

  test("de fundo para topo: a mesma regra (não inverte pela posição do preço)", () => {
    expect(fibPrice(0, 100, 1)).toBe(0);
    expect(fibPrice(0, 100, 0)).toBe(100);
    expect(fibPrice(0, 100, 0.236)).toBeCloseTo(76.4);
  });

  test("níveis padrão de retração, com cor e visíveis", () => {
    expect(DEFAULT_FIB_LEVELS.map((l) => l.value)).toEqual([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]);
    expect(DEFAULT_FIB_LEVELS.every((l) => /^#[0-9a-f]{6}$/i.test(l.color) && l.visible)).toBe(true);
  });
});

describe("vela pelo horário (perfil de volume de faixa fixa)", () => {
  const ts = [10, 20, 30, 40];
  test("índice da vela que contém o horário; fora da faixa fica na ponta", () => {
    expect(findBarIndex(ts, 20)).toBe(1);
    expect(findBarIndex(ts, 25)).toBe(1);
    expect(findBarIndex(ts, 5)).toBe(0);
    expect(findBarIndex(ts, 99)).toBe(3);
    expect(findBarIndex([], 5)).toBe(-1);
  });
});
