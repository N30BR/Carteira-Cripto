// Casos da revisão de segurança e integridade do dashboard fiduciário.
import { describe, expect, test } from "vitest";
import { buildFiatCurve, computeFiat } from "@/lib/fiat/calc";
import type { BalancePoint } from "@/lib/fiat/accounts";
import { appTimeZone, parseBrl, validateAccountName } from "@/lib/validation";

const today = "2026-11-05";
const now = new Date("2026-11-05T15:00:00Z");

describe("desempenho da curva fiduciária", () => {
  test("50 contas com 3000 saldos cada: 'Tudo' em menos de 300 ms", () => {
    const balances: Record<number, BalancePoint[]> = {};
    for (let a = 1; a <= 50; a++) {
      balances[a] = Array.from({ length: 3000 }, (_, i) => ({
        date: new Date(Date.UTC(2018, 0, 1 + i)).toISOString().slice(0, 10),
        amount: "10.00",
      }));
    }
    const t0 = performance.now();
    const pts = buildFiatCurve(balances, "Tudo", today, now);
    expect(performance.now() - t0).toBeLessThan(300);
    expect(pts.at(-1)!.value).toBe(500);
  });
});

describe("curva e percentuais", () => {
  test("'Tudo' com todos os saldos de hoje ainda desenha a curva", () => {
    expect(buildFiatCurve({ 1: [{ date: today, amount: "10.00" }] }, "Tudo", today, now).length).toBeGreaterThanOrEqual(2);
  });

  test("saldo negativo não distorce a participação das outras contas", () => {
    const r = computeFiat(
      [
        { id: 1, name: "PF", amount: "1000.00", date: today },
        { id: 2, name: "PJ", amount: "-500.00", date: today },
      ],
      { 1: [{ date: today, amount: "1000.00" }], 2: [{ date: today, amount: "-500.00" }] },
      today,
    );
    expect(r.total).toBe(500);
    expect(r.rows.find((x) => x.name === "PF")!.share).toBe(1);
    expect(r.rows.find((x) => x.name === "PJ")!.share).toBeNull();
  });
});

describe("entradas", () => {
  test("parseBrl normaliza zeros à esquerda e -0", () => {
    expect(parseBrl("0001")).toEqual({ ok: true, value: "1.00" });
    expect(parseBrl("-0")).toEqual({ ok: true, value: "0.00" });
    expect(parseBrl("-0,00")).toEqual({ ok: true, value: "0.00" });
    expect(parseBrl("-012,5")).toEqual({ ok: true, value: "-12.50" });
  });

  test("nome de conta: normaliza Unicode e recusa caracteres invisíveis ou de controle", () => {
    expect(validateAccountName("Café")).toEqual({ ok: true, value: "Café" });
    expect(validateAccountName("Conta​PF").ok).toBe(false);
    expect(validateAccountName("Conta\nPF").ok).toBe(false);
    expect(validateAccountName("‮FP atnoC").ok).toBe(false);
  });

  test("fuso inválido cai no padrão em vez de derrubar a página", () => {
    expect(appTimeZone("America/Sao_Paulo")).toBe("America/Sao_Paulo");
    expect(appTimeZone("Marte/Base")).toBe("America/Sao_Paulo");
    expect(appTimeZone(undefined)).toBe("America/Sao_Paulo");
  });
});


