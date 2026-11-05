import { describe, expect, test } from "vitest";
import type { Holding } from "@/lib/holdings/holdings";
import { PERIODS, buildCurve, computePortfolio, parsePeriod, type PricePoint } from "@/lib/portfolio/calc";

const H = (coinId: string, symbol: string, quantity: string, id = 1): Holding => ({ id, coinId, symbol, name: coinId, quantity });
const HOUR = 3600_000;

describe("computePortfolio", () => {
  const holdings = [H("ethereum", "eth", "2", 2), H("bitcoin", "btc", "0.5", 1)];
  const prices = { bitcoin: { usd: 60000, change24h: 10 }, ethereum: { usd: 3000, change24h: null } };

  test("total, percentuais e ordem por valor", () => {
    const p = computePortfolio(holdings, prices);
    expect(p.total).toBe(36000);
    expect(p.rows.map((r) => r.symbol)).toEqual(["btc", "eth"]);
    expect(p.rows[0].value).toBe(30000);
    expect(p.rows[0].share).toBeCloseTo(0.8333, 4);
    expect(p.rows[1].share).toBeCloseTo(0.1667, 4);
  });

  test("variação 24h do total segue a fórmula da spec", () => {
    const p = computePortfolio(holdings, prices);
    const delta = 30000 - 30000 / 1.1;
    expect(p.change24hUsd).toBeCloseTo(delta, 6);
    expect(p.change24hPct).toBeCloseTo(delta / (36000 - delta), 6);
  });

  test("change24h de -100 é ignorado", () => {
    const p = computePortfolio([H("bitcoin", "btc", "1")], { bitcoin: { usd: 1, change24h: -100 } });
    expect(p.change24hUsd).toBe(0);
  });

  test("moeda sem preço fica fora do total e vai para o fim", () => {
    const p = computePortfolio([H("nada", "nada", "5", 3), ...holdings], prices);
    expect(p.total).toBe(36000);
    const last = p.rows[p.rows.length - 1];
    expect(last).toMatchObject({ symbol: "nada", price: null, value: null, share: null });
  });

  test("nenhuma moeda com preço: total indisponível (null), não zero", () => {
    const p = computePortfolio([H("bitcoin", "btc", "1")], {});
    expect(p.total).toBeNull();
    expect(p.change24hPct).toBeNull();
  });

  test("carteira vazia", () => {
    expect(computePortfolio([], {})).toEqual({ rows: [], total: 0, change24hUsd: 0, change24hPct: null });
  });
});

describe("periods", () => {
  test("parsePeriod aceita os três e cai em 30D", () => {
    expect(parsePeriod("7D")).toBe("7D");
    expect(parsePeriod("1A")).toBe("1A");
    expect(parsePeriod("Tudo")).toBe("30D");
    expect(parsePeriod(undefined)).toBe("30D");
  });

  test("passos e fontes", () => {
    expect(PERIODS["7D"]).toEqual({ days: 7, stepMs: HOUR, sourceDays: 30 });
    expect(PERIODS["30D"]).toEqual({ days: 30, stepMs: 4 * HOUR, sourceDays: 30 });
    expect(PERIODS["1A"]).toEqual({ days: 365, stepMs: 24 * HOUR, sourceDays: 365 });
  });
});

describe("buildCurve", () => {
  const now = new Date("2026-03-31T10:30:00Z");
  const series = (from: number, price: (t: number) => number): PricePoint[] => {
    const out: PricePoint[] = [];
    for (let t = from; t <= now.getTime(); t += HOUR) out.push([t, price(t)]);
    return out;
  };
  const start31 = now.getTime() - 31 * 24 * HOUR;

  test("último ponto é agora e igual ao total do card", () => {
    const holdings = [H("bitcoin", "btc", "0.5")];
    const current = { bitcoin: { usd: 70000, change24h: 0 } };
    const { points } = buildCurve(holdings, { bitcoin: series(start31, () => 60000) }, current, "30D", now);
    const last = points[points.length - 1];
    expect(last).toEqual({ t: now.getTime(), value: 35000 });
  });

  test("passo do 30D é 4 h e o início é alinhado", () => {
    const { points } = buildCurve([H("bitcoin", "btc", "1")], { bitcoin: series(start31, () => 1) }, { bitcoin: { usd: 1, change24h: 0 } }, "30D", now);
    expect(points[1].t - points[0].t).toBe(4 * HOUR);
    expect(points[0].t % (4 * HOUR)).toBe(0);
    expect(points[0].t).toBeGreaterThanOrEqual(now.getTime() - 30 * 24 * HOUR);
  });

  test("moeda que começa no meio vale 0 antes do primeiro preço", () => {
    const mid = now.getTime() - 10 * 24 * HOUR;
    const holdings = [H("bitcoin", "btc", "1"), H("nova", "nova", "2", 2)];
    const history = { bitcoin: series(start31, () => 100), nova: series(mid, () => 10) };
    const current = { bitcoin: { usd: 100, change24h: 0 }, nova: { usd: 10, change24h: 0 } };
    const { points } = buildCurve(holdings, history, current, "30D", now);
    expect(points[0].value).toBe(100);
    const after = points.find((p) => p.t >= mid)!;
    expect(after.value).toBe(120);
  });

  test("moeda com preço mas sem histórico vai para missingHistory; sem preço é ignorada", () => {
    const holdings = [H("bitcoin", "btc", "1"), H("semhist", "sh", "1", 2), H("sempreco", "sp", "1", 3)];
    const current = { bitcoin: { usd: 1, change24h: 0 }, semhist: { usd: 5, change24h: 0 } };
    const r = buildCurve(holdings, { bitcoin: series(start31, () => 1) }, current, "7D", now);
    expect(r.missingHistory).toEqual(["SH"]);
    expect(r.points[r.points.length - 1].value).toBe(6);
  });

  test("nenhuma moeda com histórico: sem pontos (o gráfico mostra indisponível)", () => {
    const r = buildCurve([H("bitcoin", "btc", "1")], {}, { bitcoin: { usd: 5, change24h: 0 } }, "1A", now);
    expect(r).toEqual({ points: [], missingHistory: ["BTC"] });
  });

  test("sem moedas com preço não há pontos", () => {
    expect(buildCurve([H("bitcoin", "btc", "1")], {}, {}, "7D", now)).toEqual({ points: [], missingHistory: [] });
  });
});
