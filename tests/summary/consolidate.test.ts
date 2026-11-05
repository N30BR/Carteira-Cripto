import { describe, expect, test } from "vitest";
import { consolidate } from "@/lib/summary/consolidate";

// Números da referência Resumo.png (em centavos).
const example = { cryptoCents: 2485000, fiatCents: 1243000, invoicesCents: 137745, inflowCents: 635000, outflowCents: 318000 };

describe("consolidação do resumo", () => {
  // Saldos neutros; variação cripto positiva.
  const input = { ...example, cryptoVariationCents: 520000 };

  test("saldos são neutros; entradas = transações + valorização; resultado = saldos + entradas − saídas", () => {
    const s = consolidate(input);
    expect(s.neutral).toBe(2485000 + 1243000);
    expect(s.positive).toBe(635000 + 520000);
    expect(s.negative).toBe(137745 + 318000);
    expect(s.result).toBe(2485000 + 1243000 + 635000 + 520000 - 137745 - 318000);
    expect(s.components.map((c) => [c.key, c.signedCents, c.tone])).toEqual([
      ["crypto", 2485000, "neutral"],
      ["fiat", 1243000, "neutral"],
      ["invoices", -137745, "out"],
      ["inflow", 635000, "in"],
      ["outflow", -318000, "out"],
      ["variation", 520000, "in"],
    ]);
  });

  test("desvalorização cripto entra como saída", () => {
    const s = consolidate({ ...example, cryptoVariationCents: -100000 });
    expect(s.components.find((c) => c.key === "variation")).toMatchObject({ tone: "out", classification: "Desvalorização (−)" });
    expect(s.negative).toBe(137745 + 318000 + 100000);
  });

  test("participação sobre a soma dos valores absolutos; soma 100%", () => {
    const s = consolidate(input);
    const abs = 2485000 + 1243000 + 137745 + 635000 + 318000 + 520000;
    expect(s.components[0].share).toBeCloseTo(2485000 / abs, 12);
    expect(s.components.reduce((x, c) => x + (c.share ?? 0), 0)).toBeCloseTo(1, 12);
  });

  test("classificações: saldo neutro, entrada, saída, valorização", () => {
    const byKey = Object.fromEntries(consolidate(input).components.map((c) => [c.key, c]));
    expect(byKey.crypto.classification).toBe("Saldo patrimonial (neutro)");
    expect(byKey.fiat.classification).toBe("Saldo patrimonial (neutro)");
    expect(byKey.inflow.classification).toBe("Entrada de transação (+)");
    expect(byKey.outflow.classification).toBe("Saída de transação (−)");
    expect(byKey.invoices.classification).toBe("Fatura do período (−)");
    expect(byKey.variation.classification).toBe("Valorização (+)");
  });

  test("saldo cripto ou variação indisponíveis ficam fora da conta e são sinalizados", () => {
    const s = consolidate({ ...input, cryptoCents: null, cryptoVariationCents: null });
    expect(s.missing).toEqual(["crypto", "variation"]);
    expect(s.result).toBe(1243000 + 635000 - 137745 - 318000);
    expect(s.components.find((c) => c.key === "crypto")).toMatchObject({ signedCents: null, share: null });
  });

  test("tudo zerado: resultado zero e sem participação (sem divisão por zero)", () => {
    const s = consolidate({ cryptoCents: 0, fiatCents: 0, invoicesCents: 0, inflowCents: 0, outflowCents: 0, cryptoVariationCents: 0 });
    expect(s).toMatchObject({ neutral: 0, positive: 0, negative: 0, result: 0 });
    expect(s.components.every((c) => c.share === null)).toBe(true);
  });
});
