import { describe, expect, test } from "vitest";
import { parseBalanceDate, parseBrl, todayIn, validateAccountName } from "@/lib/validation";

describe("parseBrl", () => {
  test("aceita formatos brasileiros e com ponto decimal", () => {
    const ok = (raw: string, value: string) => expect(parseBrl(raw)).toEqual({ ok: true, value });
    ok("5230", "5230.00");
    ok("5230,5", "5230.50");
    ok("5.230,50", "5230.50");
    ok("R$ 5.230,50", "5230.50");
    ok("5230.50", "5230.50");
    ok("1.234.567", "1234567.00");
    ok("-120,00", "-120.00");
    ok("0", "0.00");
  });

  test("recusa texto, mais de 2 casas e números enormes", () => {
    for (const raw of ["", "abc", "1,234", "12,345", "1.2.3,4", "1".repeat(14)]) {
      expect(parseBrl(raw)).toEqual({ ok: false, error: "Valor inválido" });
    }
  });
});

describe("validateAccountName", () => {
  test("de 1 a 40 caracteres depois de tirar os espaços das pontas", () => {
    expect(validateAccountName("  Conta PF ")).toEqual({ ok: true, value: "Conta PF" });
    expect(validateAccountName("   ")).toEqual({ ok: false, error: "Informe um nome de 1 a 40 caracteres" });
    expect(validateAccountName("x".repeat(41)).ok).toBe(false);
  });
});

describe("datas", () => {
  test("todayIn usa o fuso indicado", () => {
    expect(todayIn("America/Sao_Paulo", new Date("2026-03-01T02:00:00Z"))).toBe("2026-02-28");
    expect(todayIn("UTC", new Date("2026-03-01T02:00:00Z"))).toBe("2026-03-01");
  });

  test("parseBalanceDate: vazio é hoje; recusa futuro, antes de 2000 e formato inválido", () => {
    const today = "2026-11-05";
    expect(parseBalanceDate("", today)).toEqual({ ok: true, value: today });
    expect(parseBalanceDate("2026-10-01", today)).toEqual({ ok: true, value: "2026-10-01" });
    expect(parseBalanceDate("2026-11-06", today)).toEqual({ ok: false, error: "A data não pode ser no futuro" });
    expect(parseBalanceDate("1999-12-31", today).ok).toBe(false);
    expect(parseBalanceDate("2026-02-30", today).ok).toBe(false);
    expect(parseBalanceDate("05/11/2026", today).ok).toBe(false);
  });
});
