import { describe, expect, test } from "vitest";
import { deriveCoinMetrics, parseBgeometrics, parseCoinMetrics } from "@/lib/charts/onchain-math";
import { ONCHAIN_IDS } from "@/lib/charts/onchain-ids";

const day = (n: number) => Date.UTC(2020, 0, 1) + n * 86_400_000;

describe("Coin Metrics (comunitária): leitura e cálculos", () => {
  test("lê as linhas (valores vêm como texto) e ignora valores faltando", () => {
    const rows = parseCoinMetrics({
      data: [
        { asset: "btc", time: "2020-01-01T00:00:00.000000000Z", CapMVRVCur: "2", CapMrktCurUSD: "200", SplyCur: "10" },
        { asset: "btc", time: "2020-01-02T00:00:00.000000000Z", CapMVRVCur: "x" },
      ],
    });
    expect(rows).toEqual([
      { t: day(0), mvrv: 2, mcap: 200, supply: 10, issUsd: null, flowIn: null, flowOut: null },
      { t: day(1), mvrv: null, mcap: null, supply: null, issUsd: null, flowIn: null, flowOut: null },
    ]);
    expect(() => parseCoinMetrics({ error: { message: "forbidden" } })).toThrow();
  });

  test("preço realizado = (valor de mercado ÷ MVRV) ÷ oferta; NUPL = 1 − 1/MVRV; netflow = entradas − saídas", () => {
    const rows = [{ t: day(0), mvrv: 2, mcap: 200, supply: 10, issUsd: 5, flowIn: 30, flowOut: 12 }];
    const d = deriveCoinMetrics(rows);
    expect(d.REALIZED_PRICE).toEqual([[day(0), 10]]);
    expect(d.NUPL).toEqual([[day(0), 0.5]]);
    expect(d.EXCHANGE_NETFLOW).toEqual([[day(0), 18]]);
  });

  test("MVRV Z-Score: (valor de mercado − realizado) ÷ desvio-padrão do valor de mercado até a data (sem olhar o futuro)", () => {
    const rows = [100, 200, 300].map((mcap, i) => ({ t: day(i), mvrv: 2, mcap, supply: 1, issUsd: null, flowIn: null, flowOut: null }));
    const z = deriveCoinMetrics(rows).MVRV_Z;
    // dia 0: desvio zero → sem valor; dia 1: std(100,200)=50 → (200−100)/50 = 2; dia 2: std(100,200,300)=81.65 → 150/81.65
    expect(z.map((p) => p[0])).toEqual([day(1), day(2)]);
    expect(z[0][1]).toBeCloseTo(2);
    expect(z[1][1]).toBeCloseTo(150 / Math.sqrt(20000 / 3));
  });

  test("Puell: emissão em US$ ÷ média dos 365 dias; só depois de 365 observações", () => {
    const rows = Array.from({ length: 366 }, (_, i) => ({ t: day(i), mvrv: null, mcap: null, supply: null, issUsd: i === 365 ? 730 : 1, flowIn: null, flowOut: null }));
    const p = deriveCoinMetrics(rows).PUELL;
    expect(p).toHaveLength(2);
    expect(p[0]).toEqual([day(364), 1]);
    expect(p[1][1]).toBeCloseTo(730 / ((364 + 730) / 365));
  });
});

describe("BGeometrics: leitura", () => {
  test("aceita números ou texto, ordena por data e ignora o que não for número", () => {
    const pts = parseBgeometrics(
      [
        { d: "2020-01-02", unixTs: "1577923200", sthRealizedPrice: "7000.5" },
        { d: "2020-01-01", unixTs: 1577836800, sthRealizedPrice: 6900 },
        { d: "2020-01-03", unixTs: 1578009600, sthRealizedPrice: null },
      ],
      "sthRealizedPrice",
    );
    expect(pts).toEqual([
      [1577836800000, 6900],
      [1577923200000, 7000.5],
    ]);
    expect(() => parseBgeometrics({ error: { status: 429 } }, "sopr")).toThrow();
  });

  test("os 10 indicadores pedidos estão cadastrados", () => {
    expect(ONCHAIN_IDS).toHaveLength(10);
  });
});

describe("cálculo próprio × BGeometrics", () => {
  test("leitura: se o campo esperado não vier, usa o único valor numérico da linha", async () => {
    const { parseBgeometrics } = await import("@/lib/charts/onchain-math");
    expect(parseBgeometrics([{ d: "2024-01-01", unixTs: 1704067200, mvrvZscore: 1.5 }], "mvrvZScore")).toEqual([[1704067200000, 1.5]]);
  });

  test("perto: diferença mediana dentro da tolerância de cada indicador (últimos 90 dias em comum)", async () => {
    const { agreement } = await import("@/lib/charts/onchain-math");
    const days = Array.from({ length: 100 }, (_, i) => i * 86_400_000);
    const bg = days.map((t) => [t, 50_000] as [number, number]);
    const calcNear = days.map((t) => [t, 50_000 * 1.01] as [number, number]); // 1%
    const calcFar = days.map((t) => [t, 50_000 * 1.2] as [number, number]); // 20%
    expect(agreement("REALIZED_PRICE", calcNear, bg)).toMatchObject({ ok: true, compared: 90 });
    expect(agreement("REALIZED_PRICE", calcFar, bg)).toMatchObject({ ok: false });
    // NUPL compara em valor absoluto
    const n = (v: number) => days.map((t) => [t, v] as [number, number]);
    expect(agreement("NUPL", n(0.3), n(0.31)).ok).toBe(true);
    expect(agreement("NUPL", n(0.3), n(0.4)).ok).toBe(false);
    // sem dias em comum: não dá para conferir
    expect(agreement("NUPL", n(0.3), [[999 * 86_400_000, 0.3]]).ok).toBe(false);
  });
});
