import { describe, expect, test } from "vitest";
import { normalizeUsername, validatePassword, validateUsername } from "@/lib/validation";

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
