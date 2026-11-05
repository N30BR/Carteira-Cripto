import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currency: "BRL", factorNow: 1, staleSince: null as Date | null }));
vi.mock("@/lib/currency-view", () => ({
  resolveCurrency: async () => ({ currency: mocks.currency, factorNow: mocks.factorNow, warning: null, staleSince: mocks.staleSince }),
}));

import { brlDisplay } from "@/lib/currency-display";

describe("exibição de valores em reais na moeda escolhida", () => {
  test("em BRL os centavos ficam exatos (sem resíduo de ponto flutuante)", async () => {
    const d = await brlDisplay({} as never, "BRL", undefined);
    expect(d.convert(29)).toBe(29);
    expect(d.convert(137745)).toBe(137745);
  });

  test("em USDT converte pela cotação; em BTC para satoshis", async () => {
    mocks.currency = "USDT";
    mocks.factorNow = 0.2;
    expect((await brlDisplay({} as never, "USDT", undefined)).convert(50000)).toBeCloseTo(10000, 9);
    mocks.currency = "BTC";
    mocks.factorNow = 0.000004;
    expect((await brlDisplay({} as never, "BTC", undefined)).convert(100)).toBeCloseTo(400, 6);
  });

  test("cotação desatualizada vira aviso", async () => {
    mocks.currency = "USDT";
    mocks.factorNow = 0.2;
    mocks.staleSince = new Date("2026-11-05T10:00:00Z");
    expect((await brlDisplay({} as never, "USDT", undefined)).staleSince).toEqual(new Date("2026-11-05T10:00:00Z"));
    mocks.staleSince = null;
  });
});
