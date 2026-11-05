import { describe, expect, test } from "vitest";
import { DUMMY_HASH, hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password", () => {
  test("verifica a senha certa e rejeita a errada", async () => {
    const hash = await hashPassword("segredo123");
    expect(hash).not.toBe("segredo123");
    expect(await verifyPassword(hash, "segredo123")).toBe(true);
    expect(await verifyPassword(hash, "errada")).toBe(false);
  });

  test("DUMMY_HASH é um hash argon2 válido que não aceita senha comum", async () => {
    const hash = await DUMMY_HASH;
    expect(hash.startsWith("$argon2")).toBe(true);
    expect(await verifyPassword(hash, "segredo123")).toBe(false);
  });
});
