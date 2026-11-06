import { describe, expect, test } from "vitest";
import { safeAction } from "@/lib/safe-action";

describe("safeAction", () => {
  test("queda de conexão vira mensagem", async () => {
    expect(await safeAction(async () => Promise.reject(new Error("rede")))).toEqual({ ok: false, error: expect.stringMatching(/Falha de conexão/) });
  });

  test("redirecionamento do servidor (módulo desligado, sessão expirada) segue adiante, sem aviso de falha", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/lancamentos;307;" });
    await expect(safeAction(async () => Promise.reject(redirect))).rejects.toBe(redirect);
  });
});
