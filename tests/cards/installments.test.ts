import { describe, expect, test } from "vitest";
import { addMonths, monthLabel, monthShort, parseMonth } from "@/lib/cards/months";
import { buildInstallments, planFromForm, splitCents } from "@/lib/cards/installments";

describe("meses", () => {
  test("soma e subtrai meses atravessando anos", () => {
    expect(addMonths("2025-05", -5)).toBe("2024-12");
    expect(addMonths("2025-12", 1)).toBe("2026-01");
    expect(addMonths("2025-01", 0)).toBe("2025-01");
  });
  test("rótulos em português", () => {
    expect(monthLabel("2025-05")).toBe("Mai/2025");
    expect(monthShort("2026-11")).toBe("NOV/26");
  });
  test("parseMonth valida formato e limites", () => {
    expect(parseMonth("2025-05")).toBe("2025-05");
    expect(parseMonth("2025-13")).toBeNull();
    expect(parseMonth("1999-12")).toBeNull();
    expect(parseMonth("2025-5")).toBeNull();
    expect(parseMonth(undefined)).toBeNull();
  });
});

describe("rateio", () => {
  test("diferença de centavos vai para a última parcela", () => {
    expect(splitCents(10000, 3)).toEqual([3333, 3333, 3334]);
    expect(splitCents(1000, 1)).toEqual([1000]);
    expect(splitCents(5, 3)).toEqual([1, 1, 3]);
  });
  test("parcelas distribuídas a partir da 1ª fatura, somando o total exato", () => {
    const list = buildInstallments(10000, 3, "2025-11");
    expect(list).toEqual([
      { number: 1, invoiceMonth: "2025-11", amountCents: 3333 },
      { number: 2, invoiceMonth: "2025-12", amountCents: 3333 },
      { number: 3, invoiceMonth: "2026-01", amountCents: 3334 },
    ]);
  });
});

describe("planFromForm", () => {
  test("6/12 com valor da parcela em Mai/2025: 1ª fatura Dez/2024, anteriores pagas", () => {
    const p = planFromForm({ amountCents: 35000, mode: "parcela", current: 6, total: 12, refMonth: "2025-05", currentPaid: false });
    expect(p).toEqual({ ok: true, totalCents: 420000, installments: 12, firstInvoice: "2024-12", paidNumbers: [1, 2, 3, 4, 5] });
  });
  test("valor total, parcela atual paga", () => {
    const p = planFromForm({ amountCents: 120000, mode: "total", current: 2, total: 3, refMonth: "2026-01", currentPaid: true });
    expect(p).toEqual({ ok: true, totalCents: 120000, installments: 3, firstInvoice: "2025-12", paidNumbers: [1, 2] });
  });
  test("à vista pendente", () => {
    expect(planFromForm({ amountCents: 999, mode: "total", current: 1, total: 1, refMonth: "2026-01", currentPaid: false })).toEqual({
      ok: true,
      totalCents: 999,
      installments: 1,
      firstInvoice: "2026-01",
      paidNumbers: [],
    });
  });
  test("recusa parcela atual maior que o total, total fora de 1–48 e valor menor que o número de parcelas", () => {
    const base = { amountCents: 1000, mode: "total" as const, refMonth: "2026-01", currentPaid: false };
    expect(planFromForm({ ...base, current: 4, total: 3 })).toEqual({ ok: false, error: "A parcela atual não pode passar do total" });
    expect(planFromForm({ ...base, current: 1, total: 49 }).ok).toBe(false);
    expect(planFromForm({ ...base, current: 0, total: 3 }).ok).toBe(false);
    expect(planFromForm({ ...base, amountCents: 2, current: 1, total: 3 }).ok).toBe(false);
  });
});

describe("teto de valor", () => {
  test("compra acima de R$ 1 bilhão é recusada", () => {
    const r = planFromForm({ amountCents: 100_000_000_001, mode: "total", current: 1, total: 1, refMonth: "2026-01", currentPaid: false });
    expect(r).toEqual({ ok: false, error: "Valor muito alto" });
    expect(planFromForm({ amountCents: 3_000_000_000, mode: "parcela", current: 1, total: 48, refMonth: "2026-01", currentPaid: false }).ok).toBe(false);
  });
});
