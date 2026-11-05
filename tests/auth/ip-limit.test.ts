import { beforeEach, describe, expect, test } from "vitest";
import { clientIp, ipLimited, recordIpFailure, resetIpLimits } from "@/lib/auth/ip-limit";

describe("clientIp", () => {
  test("usa o valor acrescentado pelo proxy, não o forjado pelo cliente", () => {
    expect(clientIp("1.2.3.4, 10.0.0.1", 1)).toBe("10.0.0.1");
  });

  test("um único valor é o próprio cliente", () => {
    expect(clientIp("9.9.9.9", 1)).toBe("9.9.9.9");
  });

  test("com dois proxies confiáveis pega o segundo a partir da direita", () => {
    expect(clientIp("1.1.1.1, 2.2.2.2, 3.3.3.3", 2)).toBe("2.2.2.2");
  });

  test("menos valores que proxies retorna o primeiro", () => {
    expect(clientIp("5.5.5.5", 2)).toBe("5.5.5.5");
  });

  test("sem cabeçalho retorna null", () => {
    expect(clientIp(null)).toBeNull();
    expect(clientIp("")).toBeNull();
  });
});

describe("limite por IP", () => {
  beforeEach(() => resetIpLimits());
  const t0 = new Date("2026-01-01T00:00:00Z");

  test("bloqueia depois de 20 falhas na janela de 15 minutos", () => {
    for (let i = 0; i < 19; i++) recordIpFailure("x", t0);
    expect(ipLimited("x", t0)).toBe(false);
    recordIpFailure("x", t0);
    expect(ipLimited("x", t0)).toBe(true);
    expect(ipLimited("y", t0)).toBe(false);
  });

  test("libera depois que a janela passa", () => {
    for (let i = 0; i < 20; i++) recordIpFailure("x", t0);
    expect(ipLimited("x", new Date(t0.getTime() + 15 * 60_000 + 1))).toBe(false);
  });

  test("IP desconhecido nunca é limitado", () => {
    for (let i = 0; i < 30; i++) recordIpFailure(null, t0);
    expect(ipLimited(null, t0)).toBe(false);
  });
});
