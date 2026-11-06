import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ user: { id: 1 } as { id: number } | null, fail: false }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/auth/current", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/charts/market", () => ({
  isListedSymbol: async (_db: unknown, s: string) => s === "BTCUSDT",
  getCandles: async () => {
    if (state.fail) throw new Error("fora");
    return [{ timestamp: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }];
  },
}));

import { GET } from "@/app/api/candles/route";
import { resetCandleRouteLimits } from "@/lib/charts/route-limit";

const call = (q: string) => GET(new Request(`http://x/api/candles?${q}`));

beforeEach(() => {
  state.user = { id: 1 };
  state.fail = false;
  resetCandleRouteLimits();
});

describe("rota de velas", () => {
  test("exige login", async () => {
    state.user = null;
    expect((await call("symbol=BTCUSDT&interval=1h")).status).toBe(401);
  });

  test("devolve as velas de um par listado", async () => {
    const r = await call("symbol=BTCUSDT&interval=1h");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([{ timestamp: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }]);
  });

  test("pedido inválido → 400; par que não existe → 404; Binance fora → 503", async () => {
    expect((await call("symbol=BTCUSDT&interval=7h")).status).toBe(400);
    expect((await call("symbol=XYZUSDT&interval=1h")).status).toBe(404);
    state.fail = true;
    expect((await call("symbol=BTCUSDT&interval=1h")).status).toBe(503);
  });

  test("limite de pedidos por minuto", async () => {
    for (let i = 0; i < 300; i++) await call("symbol=BTCUSDT&interval=1h");
    expect((await call("symbol=BTCUSDT&interval=1h")).status).toBe(429);
  });
});
