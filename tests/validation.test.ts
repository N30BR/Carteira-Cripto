import { describe, expect, test } from "vitest";
import { normalizeSearch, normalizeUsername, parseQuantity, validatePassword, validateUsername } from "@/lib/validation";

describe("username", () => {
  test("normaliza espaços e maiúsculas", () => {
    expect(normalizeUsername(" Pedro ")).toBe("pedro");
  });

  test("rejeita curto, com espaço ou longo demais", () => {
    expect(validateUsername("ab")).toBe("Usuário deve ter 3 a 32 caracteres: letras, números, . _ -");
    expect(validateUsername("a b c")).not.toBeNull();
    expect(validateUsername("a".repeat(33))).not.toBeNull();
  });

  test("aceita letras, números, ponto, sublinhado e hífen", () => {
    expect(validateUsername("pedro.h")).toBeNull();
    expect(validateUsername("ana_2-x")).toBeNull();
  });
});

describe("password", () => {
  test("exige entre 8 e 256 caracteres", () => {
    expect(validatePassword("1234567")).toBe("A senha precisa ter entre 8 e 256 caracteres");
    expect(validatePassword("x".repeat(257))).not.toBeNull();
    expect(validatePassword("12345678")).toBeNull();
    expect(validatePassword("x".repeat(256))).toBeNull();
  });
});


describe("parseQuantity", () => {
  test("aceita vírgula e ponto", () => {
    expect(parseQuantity("0,5")).toEqual({ ok: true, value: "0.5" });
    expect(parseQuantity(" 0.5 ")).toEqual({ ok: true, value: "0.5" });
    expect(parseQuantity("0.00000001")).toEqual({ ok: true, value: "0.00000001" });
    expect(parseQuantity("12")).toEqual({ ok: true, value: "12" });
  });

  test("rejeita separador de milhar, texto e vazio", () => {
    for (const raw of ["1.234,5", "abc", "", "1e5", "1,2,3"]) {
      expect(parseQuantity(raw)).toEqual({ ok: false, error: "Quantidade inválida" });
    }
  });

  test("rejeita zero e negativos", () => {
    expect(parseQuantity("0")).toEqual({ ok: false, error: "Informe uma quantidade maior que zero" });
    expect(parseQuantity("-1")).toEqual({ ok: false, error: "Informe uma quantidade maior que zero" });
  });

  test("rejeita mais de 18 casas decimais", () => {
    expect(parseQuantity("0." + "1".repeat(19))).toEqual({ ok: false, error: "Quantidade inválida" });
  });
});

describe("normalizeSearch", () => {
  test("normaliza e limita o tamanho", () => {
    expect(normalizeSearch("  BIT ")).toBe("bit");
    expect(normalizeSearch("b")).toBeNull();
    expect(normalizeSearch("x".repeat(51))).toBeNull();
  });
});
