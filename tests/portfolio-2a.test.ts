import { describe, expect, test } from "vitest";
import { PERIODS, PERIOD_OPTIONS, PORTFOLIO_PERIOD_OPTIONS, buildCurve, parsePeriod, parsePortfolioPeriod } from "@/lib/portfolio/calc";

describe("Portfólio: período 2A", () => {
  test("2A vem logo depois de 1A, só no Portfólio", () => {
    expect(PORTFOLIO_PERIOD_OPTIONS).toEqual(["1D", "1S", "1M", "3M", "6M", "1A", "2A"]);
    expect(PERIOD_OPTIONS).not.toContain("2A");
    expect(parsePortfolioPeriod("2A")).toBe("2A");
    expect(parsePortfolioPeriod("1A")).toBe("1A");
    expect(parsePortfolioPeriod("xx")).toBe("1M");
    // As outras abas não aceitam 2A.
    expect(parsePeriod("2A")).toBe("1M");
  });
  test("curva de 2A cobre 730 dias, diária, terminando no valor atual", () => {
    expect(PERIODS["2A"]).toEqual({ days: 730, stepMs: 86_400_000, sourceDays: 1000 });
    const now = new Date("2026-11-13T12:00:00Z");
    const day = 86_400_000;
    const hist = Array.from({ length: 1000 }, (_, i) => [now.getTime() - (999 - i) * day, 100 + i] as [number, number]);
    const { points } = buildCurve(
      [{ coinId: "BTC", symbol: "btc", quantity: "2" } as never],
      { BTC: hist },
      { BTC: { usd: 1200, change24h: 0 } as never },
      "2A",
      now,
    );
    expect(points.length).toBe(731);
    expect(now.getTime() - points[0].t).toBeLessThanOrEqual(730 * day);
    expect(now.getTime() - points[0].t).toBeGreaterThan(729 * day);
    expect(points.at(-1)).toEqual({ t: now.getTime(), value: 2400 });
  });
});
