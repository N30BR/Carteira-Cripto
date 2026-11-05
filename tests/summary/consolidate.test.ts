import { describe, expect, test } from "vitest";
import { consolidate } from "@/lib/summary/consolidate";

// Números da referência Resumo.png (em centavos).
const example = { cryptoCents: 2485000, fiatCents: 1243000, invoicesCents: 137745, inflowCents: 635000, outflowCents: 318000 };

describe("consolidação do resumo", () => {
  test("positivos, negativos e resultado da composição (24.850 + 12.430 + 6.350 − 1.377,45 − 3.180 = 39.072,55)", () => {
    const s = consolidate(example);
    expect(s.positive).toBe(4363000);
    expect(s.negative).toBe(455745);
    expect(s.result).toBe(3907255);
    expect(s.missing).toEqual([]);
    expect(s.components.map((c) => [c.key, c.signedCents])).toEqual([
      ["crypto", 2485000],
      ["fiat", 1243000],
      ["invoices", -137745],
      ["inflow", 635000],
      ["outflow", -318000],
    ]);
  });

  test("participação sobre a soma dos valores absolutos; soma 100%", () => {
    const s = consolidate(example);
    const abs = 2485000 + 1243000 + 137745 + 635000 + 318000;
    expect(s.components[0].share).toBeCloseTo(2485000 / abs, 12);
    expect(s.components[2].share).toBeCloseTo(137745 / abs, 12);
    expect(s.components.reduce((x, c) => x + (c.share ?? 0), 0)).toBeCloseTo(1, 12);
  });

  test("saldo patrimonial e entrada de transação têm classificações diferentes", () => {
    const byKey = Object.fromEntries(consolidate(example).components.map((c) => [c.key, c]));
    expect(byKey.crypto.classification).toBe("Saldo patrimonial (+)");
    expect(byKey.fiat.classification).toBe("Saldo patrimonial (+)");
    expect(byKey.inflow.classification).toBe("Entrada de transação (+)");
    expect(byKey.outflow.classification).toBe("Saída de transação (−)");
    expect(byKey.invoices.classification).toBe("Fatura do mês (−)");
  });

  test("saldo cripto indisponível (sem cotação) fica fora da conta e é sinalizado", () => {
    const s = consolidate({ ...example, cryptoCents: null });
    expect(s.missing).toEqual(["crypto"]);
    expect(s.result).toBe(3907255 - 2485000);
    const crypto = s.components.find((c) => c.key === "crypto")!;
    expect(crypto).toMatchObject({ signedCents: null, share: null });
  });

  test("saldo em reais negativo entra como negativo", () => {
    const s = consolidate({ ...example, fiatCents: -50000 });
    expect(s.components.find((c) => c.key === "fiat")).toMatchObject({ signedCents: -50000, classification: "Saldo patrimonial (−)" });
    expect(s.negative).toBe(455745 + 50000);
  });

  test("tudo zerado: resultado zero e sem participação (sem divisão por zero)", () => {
    const s = consolidate({ cryptoCents: 0, fiatCents: 0, invoicesCents: 0, inflowCents: 0, outflowCents: 0 });
    expect(s).toMatchObject({ positive: 0, negative: 0, result: 0 });
    expect(s.components.every((c) => c.share === null)).toBe(true);
  });
});
