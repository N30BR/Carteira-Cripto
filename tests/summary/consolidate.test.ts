import { describe, expect, test } from "vitest";
import { consolidate } from "@/lib/summary/consolidate";

// Números da referência Resumo.png (em centavos).
const example = { cryptoCents: 2485000, fiatCents: 1243000, invoicesCents: 137745, inflowCents: 635000, outflowCents: 318000 };

describe("consolidação do resumo", () => {
  // Saldo cripto = total atual (já inclui a variação). Variação: só informativa.
  const input = { ...example, cryptoVariationCents: 520000 };

  test("saldos neutros, entradas e saídas; a variação cripto não entra em nenhuma soma", () => {
    const s = consolidate(input);
    expect(s.neutral).toBe(2485000 + 1243000);
    expect(s.positive).toBe(635000);
    expect(s.negative).toBe(137745 + 318000);
    expect(s.result).toBe(2485000 + 1243000 + 635000 - 137745 - 318000);
    expect(s.result).toBe(consolidate({ ...input, cryptoVariationCents: -999999 }).result);
    expect(s.components.map((c) => [c.key, c.signedCents, c.tone])).toEqual([
      ["crypto", 2485000, "neutral"],
      ["fiat", 1243000, "neutral"],
      ["invoices", -137745, "out"],
      ["inflow", 635000, "in"],
      ["outflow", -318000, "out"],
      ["variation", 520000, "info"],
    ]);
  });

  test("participação só dos cinco componentes contabilizados (sem a variação); soma 100%", () => {
    const s = consolidate(input);
    const abs = 2485000 + 1243000 + 137745 + 635000 + 318000;
    expect(s.components[0].share).toBeCloseTo(2485000 / abs, 12);
    expect(s.components.find((c) => c.key === "variation")!.share).toBeNull();
    expect(s.components.reduce((x, c) => x + (c.share ?? 0), 0)).toBeCloseTo(1, 12);
  });

  test("classificações: saldo neutro, entrada, saída e variação informativa", () => {
    const byKey = Object.fromEntries(consolidate(input).components.map((c) => [c.key, c]));
    expect(byKey.crypto.classification).toBe("Saldo patrimonial (neutro)");
    expect(byKey.fiat.classification).toBe("Saldo patrimonial (neutro)");
    expect(byKey.inflow.classification).toBe("Entrada de transação (+)");
    expect(byKey.outflow.classification).toBe("Saída de transação (−)");
    expect(byKey.invoices.classification).toBe("Fatura do período (−)");
    expect(byKey.variation.classification).toBe("Informativa (não contabilizada)");
  });

  test("saldo cripto indisponível fica fora da conta; variação indisponível só é sinalizada", () => {
    const s = consolidate({ ...input, cryptoCents: null, cryptoVariationCents: null });
    expect(s.missing).toEqual(["crypto", "variation"]);
    expect(s.result).toBe(1243000 + 635000 - 137745 - 318000);
  });

  test("tudo zerado: resultado zero e sem participação (sem divisão por zero)", () => {
    const s = consolidate({ cryptoCents: 0, fiatCents: 0, invoicesCents: 0, inflowCents: 0, outflowCents: 0, cryptoVariationCents: 0 });
    expect(s).toMatchObject({ neutral: 0, positive: 0, negative: 0, result: 0 });
    expect(s.components.every((c) => c.share === null)).toBe(true);
  });
});
