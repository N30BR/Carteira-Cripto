import { describe, expect, test } from "vitest";
import { atr, ema, ichimoku, mfi, rsi, rsiDivergences, stochRsi, volumeProfile, vwap } from "@/lib/charts/indicators";

type Bar = { timestamp: number; open: number; high: number; low: number; close: number; volume: number };
const bar = (i: number, close: number, o: Partial<Bar> = {}): Bar => ({
  timestamp: i * 3_600_000,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 10,
  ...o,
});
const series = (closes: number[]) => closes.map((c, i) => bar(i, c));

describe("EMA e RSI", () => {
  test("EMA começa na média simples e segue a fórmula", () => {
    const e = ema([1, 2, 3, 4, 5], 3);
    expect(e.slice(0, 2)).toEqual([null, null]);
    expect(e[2]).toBeCloseTo(2, 10);
    expect(e[3]).toBeCloseTo(3, 10);
    expect(e[4]).toBeCloseTo(4, 10);
  });

  test("RSI: só altas = 100; só quedas = 0; antes do período = null", () => {
    expect(rsi([1, 2, 3, 4, 5, 6], 3).at(-1)).toBe(100);
    expect(rsi([6, 5, 4, 3, 2, 1], 3).at(-1)).toBe(0);
    expect(rsi([1, 2, 3], 3)).toEqual([null, null, null]);
  });
});

describe("VWAP, ATR, MFI, Estocástico RSI e Ichimoku", () => {
  test("VWAP acumulado: média dos preços típicos pesada pelo volume", () => {
    const bars = [bar(0, 10, { high: 11, low: 9, volume: 1 }), bar(1, 20, { high: 21, low: 19, volume: 3 })];
    expect(vwap(bars)).toEqual([10, (10 * 1 + 20 * 3) / 4]);
  });

  test("ATR de Wilder com amplitude constante", () => {
    const a = atr(series([10, 10, 10, 10, 10]), 3);
    expect(a.slice(0, 2)).toEqual([null, null]);
    expect(a[2]).toBeCloseTo(2, 10);
    expect(a[4]).toBeCloseTo(2, 10);
  });

  test("MFI: só fluxo positivo = 100", () => {
    expect(mfi(series([1, 2, 3, 4, 5, 6]), 3).at(-1)).toBe(100);
  });

  test("Estocástico RSI entre 0 e 100", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 10);
    const { k, d } = stochRsi(closes, 14, 14, 3, 3);
    const valid = k.filter((x): x is number => x !== null);
    expect(valid.length).toBeGreaterThan(10);
    expect(valid.every((x) => x >= 0 && x <= 100)).toBe(true);
    expect(d.filter((x) => x !== null).length).toBeGreaterThan(5);
  });

  test("Ichimoku: tenkan e kijun são o meio da máxima e mínima do período", () => {
    const bars = Array.from({ length: 60 }, (_, i) => bar(i, i, { high: i + 1, low: i - 1 }));
    const r = ichimoku(bars, 9, 26, 52);
    expect(r[59].tenkan).toBeCloseTo(((59 + 1) + (51 - 1)) / 2, 10);
    expect(r[59].kijun).toBeCloseTo(((59 + 1) + (34 - 1)) / 2, 10);
    expect(r[0].tenkan).toBeNull();
  });
});

describe("Volume Profile da faixa visível", () => {
  test("distribui o volume pelas faixas de preço e marca o POC e a área de valor (70%)", () => {
    const bars = [
      bar(0, 10, { high: 10.5, low: 9.5, volume: 100 }),
      bar(1, 10, { high: 10.5, low: 9.5, volume: 100 }),
      bar(2, 20, { high: 20.5, low: 19.5, volume: 10 }),
    ];
    const vp = volumeProfile(bars, 0, 2, 10);
    expect(vp.bins).toHaveLength(10);
    expect(vp.bins.reduce((s, b) => s + b.volume, 0)).toBeCloseTo(210, 6);
    const poc = vp.bins[vp.pocIndex];
    expect(poc.from).toBeLessThanOrEqual(10);
    expect(poc.to).toBeGreaterThanOrEqual(10);
    expect(vp.valueArea.low).toBeLessThanOrEqual(10);
    expect(vp.valueArea.high).toBeGreaterThanOrEqual(10);
  });

  test("faixa vazia ou sem volume não quebra", () => {
    expect(volumeProfile([], 0, 0, 24).bins).toEqual([]);
    expect(volumeProfile([bar(0, 5, { volume: 0 })], 0, 0, 24).bins.every((b) => b.volume === 0)).toBe(true);
  });
});

describe("Divergências do RSI", () => {
  test("baixa: preço faz topo mais alto e o RSI faz topo mais baixo", () => {
    // Sobe forte, recua, sobe pouco a um topo mais alto: momentum menor no 2º topo.
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 100 + i * 3),
      ...Array.from({ length: 8 }, (_, i) => 154 - i * 4),
      ...Array.from({ length: 12 }, (_, i) => 129 + i * 2.6),
      ...Array.from({ length: 6 }, (_, i) => 155 - i * 4),
    ];
    const div = rsiDivergences(closes, 14, 3);
    expect(div.some((d) => d.kind === "bear")).toBe(true);
    expect(div.every((d) => d.to > d.from)).toBe(true);
  });
});

describe("delta e CVD", () => {
  test("delta = compras agressoras − vendas agressoras; CVD acumula", async () => {
    const { deltaSeries } = await import("@/lib/charts/indicators");
    const bars = [
      { ...bar(0, 10), volume: 10, buyVolume: 7 },
      { ...bar(1, 10), volume: 10, buyVolume: 2 },
      { ...bar(2, 10), volume: 4 }, // sem dado de compras: delta indisponível, CVD mantém
    ];
    expect(deltaSeries(bars)).toEqual({ delta: [4, -6, null], cvd: [4, -2, -2] });
  });
});

describe("heatmap de liquidações (estimado)", () => {
  test("aumento de OI abre níveis de liquidação de compras abaixo e de vendas acima, conforme a alavancagem", async () => {
    const { liquidationLevels } = await import("@/lib/charts/indicators");
    const bars = [bar(0, 100, { high: 100, low: 100 }), bar(1, 100, { high: 100, low: 100 })];
    const oi = [
      [0, 1000],
      [3_600_000, 1010], // +10 contratos a ~US$ 100 = US$ 1.000 de posições novas
    ] as [number, number][];
    const levels = liquidationLevels(bars, oi, [{ leverage: 10, weight: 1 }]);
    const longs = levels.filter((l) => l.side === "long");
    const shorts = levels.filter((l) => l.side === "short");
    expect(longs).toHaveLength(1);
    expect(longs[0].price).toBeCloseTo(90.5, 6); // 100 × (1 − 1/10 + 0,5% de margem de manutenção)
    expect(shorts[0].price).toBeCloseTo(109.5, 6);
    expect(longs[0].notional).toBeCloseTo(500, 6); // metade compradores, metade vendedores
    expect(longs[0].to).toBeNull(); // ainda não atingido
  });

  test("o nível some (é liquidado) quando o preço passa por ele; queda de OI não cria níveis", async () => {
    const { liquidationLevels } = await import("@/lib/charts/indicators");
    const bars = [bar(0, 100, { high: 100, low: 100 }), bar(1, 100, { high: 100, low: 100 }), bar(2, 85, { high: 100, low: 85 })];
    const oi = [
      [0, 1000],
      [3_600_000, 1010],
      [7_200_000, 990],
    ] as [number, number][];
    const levels = liquidationLevels(bars, oi, [{ leverage: 10, weight: 1 }]);
    expect(levels).toHaveLength(2);
    expect(levels.find((l) => l.side === "long")!.to).toBe(2);
    expect(levels.find((l) => l.side === "short")!.to).toBeNull();
  });
});

describe("média simples e área de valor configurável", () => {
  test("sma: média dos últimos n valores", async () => {
    const { sma } = await import("@/lib/charts/indicators");
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
    expect(sma([1, 2], 5)).toEqual([null, null]);
  });

  test("perfil de volume: área de valor com a % pedida (padrão 70%)", () => {
    const bars = [10, 20, 30, 40, 50].map((p, i) => ({ timestamp: i, open: p, high: p + 1, low: p, close: p, volume: i === 2 ? 100 : 10 }));
    const narrow = volumeProfile(bars, 0, 4, 5, 0.5);
    const wide = volumeProfile(bars, 0, 4, 5, 1);
    expect(narrow.valueArea.high - narrow.valueArea.low).toBeLessThan(wide.valueArea.high - wide.valueArea.low);
    expect(volumeProfile(bars, 0, 4, 5)).toEqual(volumeProfile(bars, 0, 4, 5, 0.7));
  });
});

describe("VWAP ancorado", () => {
  test("começa na vela da âncora e acumula preço típico × volume desde ela", async () => {
    const { anchoredVwap } = await import("@/lib/charts/indicators");
    const bars = [
      { timestamp: 0, open: 1, high: 1, low: 1, close: 1, volume: 100 },
      { timestamp: 1, open: 10, high: 12, low: 9, close: 9, volume: 1 }, // típico 10
      { timestamp: 2, open: 20, high: 21, low: 19, close: 20, volume: 3 }, // típico 20
    ];
    expect(anchoredVwap(bars, 1)).toEqual([null, 10, 17.5]);
    expect(anchoredVwap(bars, 5)).toEqual([null, null, null]);
  });
});
