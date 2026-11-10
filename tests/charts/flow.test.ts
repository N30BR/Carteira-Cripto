import { describe, expect, test } from "vitest";
import { deltaProfile, footprintCandle, footprintStep, groupSub, hasFlow, pickSubInterval, type FlowBar } from "@/lib/charts/flow";
import { defaultPrefs, sanitizePrefs } from "@/lib/charts/workspace";

const M = 60_000;
const bar = (t: number, low: number, high: number, volume: number, buyVolume?: number): FlowBar => ({ timestamp: t, open: low, high, low, close: high, volume, ...(buyVolume === undefined ? {} : { buyVolume }) });
const S = { rowMode: "count" as const, levels: 4, atrPeriod: 14, imbalancePct: 300, imbalanceMin: 0, stackedMin: 2, valueAreaPct: 70 };

describe("fluxo por preço (velas menores reais)", () => {
  test("vela menor sem volume comprador não conta (não inventa fluxo)", () => {
    expect(hasFlow(bar(0, 1, 2, 10, 4))).toBe(true);
    expect(hasFlow(bar(0, 1, 2, 10))).toBe(false);
    expect(hasFlow(bar(0, 1, 2, 10, 11))).toBe(false);
    expect(deltaProfile([bar(0, 100, 104, 10)], 100, 104, 4).used).toBe(0);
  });

  test("delta por faixa: compras e vendas de cada vela menor repartidas pela faixa dela", () => {
    // Vela menor 100–102: 8 compras, 2 vendas; vela menor 102–104: 1 compra, 9 vendas.
    const { levels, used } = deltaProfile([bar(0, 100, 102, 10, 8), bar(M, 102, 104, 10, 1)], 100, 104, 4);
    expect(used).toBe(2);
    expect(levels.map((L) => +(L.buy - L.sell).toFixed(6))).toEqual([3, 3, -4, -4]);
    expect(levels.reduce((a, L) => a + L.buy + L.sell, 0)).toBeCloseTo(20);
  });

  test("footprint da vela: delta e volume totais, POC, área de valor e imbalance diagonal", () => {
    const candle = bar(0, 100, 104, 0);
    // Nível 0 (100–101): vendas 9; nível 1 (101–102): compras 30 (≥ 300% das vendas do nível 0 → imbalance de compra).
    const sub = [bar(0, 100, 101, 10, 1), bar(M, 101, 102, 31, 30), bar(2 * M, 102, 103, 4, 2), bar(3 * M, 103, 104, 2, 1)];
    const fp = footprintCandle(candle, sub, null, S);
    expect(fp.used).toBe(4);
    expect(fp.volume).toBeCloseTo(47);
    expect(fp.delta).toBeCloseTo(1 - 9 + 30 - 1 + 2 - 2 + 1 - 1);
    expect(fp.pocIndex).toBe(1);
    expect(fp.levels[1].buyImb).toBe(true);
    expect(fp.levels[0].buyImb).toBe(false);
    // Área de valor de 70%: começa no POC (31) e soma o lado de mais volume (nível 0: 10) → 41/47 ≥ 70%.
    expect(fp.vaLow).toBe(100);
    expect(fp.vaHigh).toBe(102);
  });

  test("sem velas menores com fluxo: vela vazia", () => {
    expect(footprintCandle(bar(0, 100, 104, 0), [bar(0, 100, 101, 10)], null, S).used).toBe(0);
  });

  test("vela de base: a menor que cabe no orçamento e divide a vela em ≥ 4 partes", () => {
    expect(pickSubInterval(60 * M, 30 * 60 * M)?.id).toBe("1m");
    expect(pickSubInterval(240 * M, 500 * 240 * M)?.id).toBe("30m");
    expect(pickSubInterval(M, 100 * M)).toBeNull();
    expect(pickSubInterval(5 * M, 100 * 5 * M)?.id).toBe("1m");
  });

  test("agrupa as velas menores por vela do gráfico; faixa automática com preços redondos", () => {
    const g = groupSub([bar(0, 1, 2, 1), bar(60 * M, 1, 2, 1)], 60 * M, [bar(0, 1, 2, 1), bar(30 * M, 1, 2, 1), bar(60 * M, 1, 2, 1), bar(130 * M, 1, 2, 1)]);
    expect(g.get(0)?.length).toBe(2);
    expect(g.get(60 * M)?.length).toBe(1);
    expect(footprintStep([bar(0, 100, 112, 1), bar(M, 100, 112, 1)], { rowMode: "auto", levels: 12, atrPeriod: 14 })).toBe(1);
  });

  test("estilos das camadas: só valores válidos (cores, faixas, modos)", () => {
    const r = sanitizePrefs({
      ...defaultPrefs(),
      layerStyles: { marks: { poc: { color: "#ff0000", size: 2, style: "dotted", label: false, x: 1 } }, delta: { width: 5000, pos: "#00ff00" }, footprint: { mode: "delta", levels: 999, imbalancePct: 250 } },
    });
    expect(r.ok && r.value.layerStyles).toEqual({ marks: { poc: { color: "#ff0000", size: 2, style: "dotted", label: false } }, delta: { pos: "#00ff00" }, footprint: { mode: "delta", imbalancePct: 250 } });
  });
});
