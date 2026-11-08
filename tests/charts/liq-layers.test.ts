import { describe, expect, test } from "vitest";
import { heatColor, liquidationHeatGrid, liquiditySideProfile, type LiqLevel } from "@/lib/charts/indicators";

const lvl = (side: "long" | "short", price: number, from: number, to: number | null, notional: number): LiqLevel => ({ side, price, from, to, notional });

describe("mapa de liquidações (grade)", () => {
  test("liquidez ativa por faixa e tempo: soma, termina quando o preço atinge o nível e segue até o fim se não foi atingido", () => {
    const levels = [lvl("short", 105, 0, 3, 10), lvl("short", 105.5, 1, null, 5), lvl("long", 95, 2, null, 7), lvl("long", 50, 0, null, 99)];
    const g = liquidationHeatGrid(levels, 0, 5, 90, 110, 4, 5);
    // Faixas de 5: [90,95) [95,100) [100,105) [105,110). 105 e 105.5 caem na linha 3; 95 na linha 1; 50 fica fora.
    const row3 = g.segments.filter((s) => s.row === 3);
    expect(row3).toEqual([
      { row: 3, from: 0, to: 1, value: 10 },
      { row: 3, from: 1, to: 3, value: 15 },
      { row: 3, from: 3, to: 6, value: 5 },
    ]);
    expect(g.segments.filter((s) => s.row === 1)).toEqual([{ row: 1, from: 2, to: 6, value: 7 }]);
    expect(g.max).toBe(15);
  });

  test("só as velas visíveis; faixa inválida não desenha", () => {
    const g = liquidationHeatGrid([lvl("short", 105, 0, null, 10)], 3, 4, 90, 110, 4, 10);
    expect(g.segments).toEqual([{ row: 3, from: 3, to: 5, value: 10 }]);
    expect(liquidationHeatGrid([lvl("short", 105, 0, null, 10)], 0, 4, 110, 90, 4, 10).segments).toEqual([]);
  });
});

describe("perfil lateral de liquidez", () => {
  test("só níveis ainda não atingidos; acumulados a partir do preço atual (vendidos acima, comprados abaixo)", () => {
    const levels = [lvl("short", 106, 0, null, 10), lvl("short", 102, 0, null, 4), lvl("short", 108, 0, 3, 100), lvl("long", 96, 0, null, 6), lvl("long", 92, 0, null, 2)];
    const p = liquiditySideProfile(levels, 90, 110, 4, 100);
    expect(p.rows.map((r) => r.value)).toEqual([2, 6, 4, 10]);
    expect(p.rows.map((r) => r.side)).toEqual(["long", "long", "short", "short"]);
    // Preço 100 está na linha 2: acima acumula 4, depois 14; abaixo acumula 4 (a linha do preço), depois 10, depois 12.
    expect(p.cumAbove.slice(2)).toEqual([4, 14]);
    expect(p.cumBelow.slice(0, 3)).toEqual([12, 10, 4]);
    expect(p.totalAbove).toBe(14);
    expect(p.totalBelow).toBe(12);
    expect(p.max).toBe(10);
  });

  test("escala de cores: azul na baixa, vermelho na alta", () => {
    expect(heatColor(0)).toBe("rgba(12, 26, 92, 1)");
    expect(heatColor(1)).toBe("rgba(235, 40, 30, 1)");
    expect(heatColor(2)).toBe(heatColor(1));
  });
});
