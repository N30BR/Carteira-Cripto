import { describe, expect, test } from "vitest";
import { MACRO_SERIES, alignStep, combine, parseFredObservations, rebase } from "@/lib/charts/macro";

const T = (d: string) => Date.parse(`${d}T00:00:00Z`);

describe("leitura do FRED", () => {
  test("converte observações em [data, valor] e ignora faltantes ('.')", () => {
    const json = {
      observations: [
        { date: "2026-01-01", value: "4.25" },
        { date: "2026-01-02", value: "." },
        { date: "2026-01-03", value: "4.30" },
      ],
    };
    expect(parseFredObservations(json)).toEqual([
      [T("2026-01-01"), 4.25],
      [T("2026-01-03"), 4.3],
    ]);
    expect(() => parseFredObservations({})).toThrow();
  });
});

describe("alinhar e combinar séries", () => {
  const a: [number, number][] = [
    [T("2026-01-01"), 10],
    [T("2026-01-08"), 20],
  ];

  test("alinhamento em degrau: último valor conhecido até cada instante; antes do início = null", () => {
    expect(alignStep(a, [T("2025-12-31"), T("2026-01-01"), T("2026-01-05"), T("2026-01-09")])).toEqual([null, 10, 10, 20]);
  });

  test("combina partes com escala e câmbio, nas datas da primeira parte", () => {
    const eur: [number, number][] = [[T("2026-01-01"), 1]];
    const usdPerEur: [number, number][] = [
      [T("2026-01-01"), 1.1],
      [T("2026-01-07"), 1.2],
    ];
    // Fed (milhões US$) + BCE (milhões € × US$/€) → em trilhões de US$
    const out = combine(
      [
        { points: a, scale: 1e-6 },
        { points: eur, scale: 1e-6, fx: usdPerEur, fxMode: "multiply" },
      ],
    );
    expect(out[0][0]).toBe(T("2026-01-01"));
    expect(out[0][1]).toBeCloseTo((10 + 1 * 1.1) * 1e-6, 12);
    expect(out[1][1]).toBeCloseTo((20 + 1 * 1.2) * 1e-6, 12);
  });

  test("sem câmbio ou sem valor de alguma parte numa data: a data fica de fora", () => {
    const late: [number, number][] = [[T("2026-01-05"), 5]];
    expect(combine([{ points: a, scale: 1 }, { points: late, scale: 1 }])).toEqual([[T("2026-01-08"), 25]]);
  });
});

describe("rebase para comparar desempenho", () => {
  test("a série começa no mesmo valor do preço e segue as próprias variações", () => {
    expect(rebase([null, 50, 100, 75], [1000, 1000, 1100, 1200])).toEqual([null, 1000, 2000, 1500]);
    expect(rebase([null, null], [1, 2])).toEqual([null, null]);
  });
});

describe("séries macro disponíveis", () => {
  test("juros em painel próprio; liquidez e M2 na mesma janela (rebase)", () => {
    const byId = Object.fromEntries(MACRO_SERIES.map((m) => [m.id, m]));
    expect(byId.FED_FUNDS).toMatchObject({ pane: "sub" });
    expect(byId.UST10Y).toMatchObject({ pane: "sub" });
    expect(byId.US_M2).toMatchObject({ pane: "main" });
    expect(byId.FED_NET_LIQUIDITY).toMatchObject({ pane: "main" });
    expect(byId.GLOBAL_LIQUIDITY).toMatchObject({ pane: "main" });
  });
});
