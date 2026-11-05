import { describe, expect, test } from "vitest";
import { analysisWindow, portfolioValueAt } from "@/lib/summary/window";

describe("janela de análise do Resumo (começa no mês de referência)", () => {
  test("1M = o mês inteiro; faturas do próprio mês", () => {
    expect(analysisWindow("2026-05", "1M")).toEqual({
      fromDate: "2026-05-01",
      toDate: "2026-05-31",
      invoiceMonths: ["2026-05"],
    });
  });

  test("1D e 1S começam no dia 1; faturas do mês de referência", () => {
    expect(analysisWindow("2026-05", "1D")).toEqual({ fromDate: "2026-05-01", toDate: "2026-05-01", invoiceMonths: ["2026-05"] });
    expect(analysisWindow("2026-05", "1S")).toEqual({ fromDate: "2026-05-01", toDate: "2026-05-07", invoiceMonths: ["2026-05"] });
  });

  test("3M, 6M e 1A seguem para os meses seguintes, inclusive virando o ano", () => {
    expect(analysisWindow("2026-11", "3M")).toEqual({
      fromDate: "2026-11-01",
      toDate: "2027-01-31",
      invoiceMonths: ["2026-11", "2026-12", "2027-01"],
    });
    expect(analysisWindow("2026-03", "6M").invoiceMonths).toHaveLength(6);
    expect(analysisWindow("2026-03", "1A")).toMatchObject({ fromDate: "2026-03-01", toDate: "2027-02-28" });
    expect(analysisWindow("2024-03", "1A").invoiceMonths.at(-1)).toBe("2025-02");
  });
});

describe("valor da carteira num instante", () => {
  const H = (coinId: string, quantity: string) => ({ id: 1, coinId, symbol: coinId, name: coinId, quantity });
  const history = {
    BTC: [
      [1000, 50000],
      [2000, 60000],
    ] as [number, number][],
    SOL: [[1500, 100]] as [number, number][],
  };

  test("usa o último preço até o instante; moedas sem preço ainda ficam de fora dos dois lados", () => {
    // Em t=1200: só o BTC tinha preço (50.000); o SOL só aparece em 1500.
    expect(portfolioValueAt([H("BTC", "0.5"), H("SOL", "10")], history, 1200, ["BTC"])).toBe(25000);
    expect(portfolioValueAt([H("BTC", "0.5"), H("SOL", "10")], history, 2500, ["BTC", "SOL"])).toBe(31000);
  });

  test("antes do primeiro preço da moeda: null (sem dado para comparar)", () => {
    expect(portfolioValueAt([H("BTC", "1")], history, 500, ["BTC"])).toBeNull();
  });
});

describe("meia-noite no fuso do app", () => {
  test("início do dia em São Paulo (UTC−3) e em UTC", async () => {
    const { zonedMidnight } = await import("@/lib/summary/window");
    expect(zonedMidnight("2026-05-01", "America/Sao_Paulo")).toBe(Date.UTC(2026, 4, 1, 3));
    expect(zonedMidnight("2026-05-01", "UTC")).toBe(Date.UTC(2026, 4, 1, 0));
    expect(zonedMidnight("2027-01-01", "America/Sao_Paulo")).toBe(Date.UTC(2027, 0, 1, 3));
  });
});
