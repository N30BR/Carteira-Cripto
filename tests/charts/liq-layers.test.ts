import { describe, expect, test } from "vitest";
import {
  DEFAULT_LEVERAGE_TIERS,
  heatBucketOf,
  heatColor,
  heatIntensity,
  heatReference,
  heatValue,
  liquidationHeatField,
  volumeProfileBand,
  type LiqHeatField,
} from "@/lib/charts/indicators";
import {
  SIDE_ROWS,
  SIDE_VALUE_AREA,
  sideProfileFor,
} from "@/lib/charts/side-profile";

const H = 3_600_000;
const bar = (
  i: number,
  low: number,
  high: number,
  close = (low + high) / 2,
  volume = 10,
  buyVolume?: number,
) => ({
  timestamp: i * H,
  open: close,
  high,
  low,
  close,
  volume,
  ...(buyVolume === undefined ? {} : { buyVolume }),
});
const column = (f: LiqHeatField, i: number) =>
  Array.from({ length: f.buckets }, (_, j) => heatValue(f, i, j));
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

describe("mapa de liquidações: campo histórico tempo × preço", () => {
  // Preço parado em 99–101; OI: sem dado na vela 0, 1000 na 1, 1100 na 2 (+100), 1100 na 3, 550 na 4 (metade fechada).
  const bars = [0, 1, 2, 3, 4].map((i) => bar(i, 99, 101, 100));
  const oi: [number, number][] = [
    [1 * H, 1000],
    [2 * H, 1100],
    [3 * H, 1100],
    [4 * H, 550],
  ];
  const f = liquidationHeatField(bars, oi);

  test("sem coluna antes do 1º open interest (não inventa o passado)", () => {
    expect(f.start).toBe(1);
    expect(sum(column(f, 0))).toBe(0);
    expect(sum(column(f, 1))).toBe(0);
  });

  test("OI subiu: entra ΔOI × preço típico, metade comprada e metade vendida, espalhada pela faixa da vela", () => {
    const total = 100 * 100;
    expect(sum(column(f, 2))).toBeCloseTo(total, 0);
    let long = 0;
    let short = 0;
    for (let j = 0; j < f.buckets; j++) {
      long += f.long[(2 - f.start) * f.buckets + j];
      short += f.short[(2 - f.start) * f.buckets + j];
    }
    expect(long).toBeCloseTo(total / 2, 0);
    expect(short).toBeCloseTo(total / 2, 0);
    // 10x comprado: a liquidação fica perto de 90,5–91 (não num preço só): várias faixas ocupadas.
    const a = heatBucketOf(f, 99 * (1 - 0.1 + 0.005));
    const z = heatBucketOf(f, 101 * (1 - 0.1 + 0.005));
    expect(z - a).toBeGreaterThan(1);
    for (let j = a; j <= z; j++) expect(heatValue(f, 2, j)).toBeGreaterThan(0);
    // Nada acima do preço do lado comprado.
    for (let j = heatBucketOf(f, 102); j < f.buckets; j++)
      expect(f.long[(2 - f.start) * f.buckets + j]).toBe(0);
  });

  test("persiste enquanto o preço não chega; o que a vela seguinte tocou é liquidado; OI caindo à metade reduz à metade", () => {
    // Faixas fora do caminho do preço (99–101): iguais na vela seguinte.
    const away = (i: number) =>
      sum(
        column(f, i).filter(
          (_, j) => j < heatBucketOf(f, 98.9) || j > heatBucketOf(f, 101.1),
        ),
      );
    expect(away(3)).toBeCloseTo(away(2), 0);
    expect(away(3)).toBeGreaterThan(0);
    // 100x (±0,5%) cai dentro da faixa de 99–101: liquidado na vela seguinte.
    expect(heatValue(f, 2, heatBucketOf(f, 100))).toBeGreaterThan(0);
    expect(heatValue(f, 3, heatBucketOf(f, 100))).toBe(0);
    expect(sum(column(f, 4))).toBeCloseTo(sum(column(f, 3)) / 2, 0);
  });

  test("o preço passando pelo nível liquida (zera aquelas faixas de preço)", () => {
    const moved = [...bars.slice(0, 3), bar(3, 89, 101, 95)];
    const g = liquidationHeatField(moved, oi.slice(0, 3));
    // Comprados de 10x (≈ 90–91) foram atingidos pela mínima de 89.
    expect(heatValue(g, 3, heatBucketOf(g, 90.6))).toBe(0);
    expect(heatValue(g, 2, heatBucketOf(g, 90.6))).toBeGreaterThan(0);
    // Vendidos de 10x (≈ 109–110) seguem vivos.
    expect(heatValue(g, 3, heatBucketOf(g, 109.6))).toBeGreaterThan(0);
  });

  test("sem open interest: sem mapa", () => {
    expect(liquidationHeatField(bars, []).start).toBe(-1);
    expect(
      DEFAULT_LEVERAGE_TIERS.reduce((s, t) => s + t.weight, 0),
    ).toBeCloseTo(1);
  });

  test("escala: referência por percentil (um pico isolado não apaga o resto) e intensidade proporcional ao valor", () => {
    const ref = heatReference(f, 0, 4, 0, f.buckets - 1);
    expect(ref).toBeGreaterThan(0);
    expect(heatIntensity(0, ref)).toBe(0);
    expect(heatIntensity(ref, ref)).toBeCloseTo(1);
    expect(heatIntensity(ref * 50, ref)).toBe(1);
    expect(heatIntensity(ref / 10, ref)).toBeCloseTo(0.1);
    expect(heatIntensity(ref / 2, ref)).toBeCloseTo(0.5);
  });

  test("cores: azul-marinho na baixa, vermelho na alta", () => {
    expect(heatColor(0)).toBe("rgba(12, 26, 92, 1)");
    expect(heatColor(1)).toBe("rgba(235, 40, 30, 1)");
    expect(heatColor(2)).toBe(heatColor(1));
  });
});

describe("perfil de volume lateral = cálculo da ferramenta Faixa Fixa", () => {
  const data = Array.from({ length: 30 }, (_, i) =>
    bar(i, 100 + (i % 5), 104 + (i % 7), 102 + (i % 3), 10 + i, 4 + (i % 4)),
  );

  test("mesmas velas, mesma faixa de preço e mesmos parâmetros → resultado idêntico", () => {
    const side = sideProfileFor(data as never, 5, 20, 101, 109);
    const tool = volumeProfileBand(
      data,
      5,
      20,
      101,
      109,
      SIDE_ROWS,
      SIDE_VALUE_AREA,
    );
    expect(side).toEqual(tool);
    expect(SIDE_ROWS).toBe(24);
    expect(side.bins).toHaveLength(24);
  });

  test("só as velas da janela e só o volume dentro da faixa de preço", () => {
    const all = sideProfileFor(data as never, 0, 29, 0, 1000);
    const part = sideProfileFor(data as never, 10, 19, 0, 1000);
    const vol = (from: number, to: number) =>
      data.slice(from, to + 1).reduce((s, b) => s + b.volume, 0);
    expect(all.bins.reduce((s, b) => s + b.volume, 0)).toBeCloseTo(vol(0, 29));
    expect(part.bins.reduce((s, b) => s + b.volume, 0)).toBeCloseTo(
      vol(10, 19),
    );
    // Compras = volume comprador real da Binance (buyVolume).
    expect(part.bins.reduce((s, b) => s + b.buy, 0)).toBeCloseTo(
      data.slice(10, 20).reduce((s, b) => s + (b.buyVolume ?? 0), 0),
    );
  });
});

describe("mapa: cores suavizadas (só o desenho)", () => {
  test("mesma ordem de intensidade; vermelho menos saturado/brilhante e menos opaco que antes", async () => {
    const { softHeat } = await import("@/lib/charts/heat-soft");
    const lum = ([r, g, b]: number[]) => 0.3 * r + 0.59 * g + 0.11 * b;
    const [r, g, b, a] = softHeat(1);
    expect(a).toBeCloseTo(0.7);
    expect(softHeat(0.05)[3]).toBeGreaterThan(0.28);
    expect(r).toBeLessThan(235);
    expect(r - Math.min(g, b)).toBeLessThan(235 - 30);
    expect(lum(softHeat(0.75))).toBeLessThan(lum([236, 222, 30]));
    for (let t = 0; t < 0.85; t += 0.1) expect(softHeat(t + 0.1)[3]).toBeGreaterThan(softHeat(t)[3]);
  });
});
