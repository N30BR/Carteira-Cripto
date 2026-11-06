import { beforeEach, describe, expect, test, vi } from "vitest";
import { BinanceError } from "@/lib/prices/binance";

const state = vi.hoisted(() => ({ user: { id: 1 } as { id: number } | null, error: null as unknown }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/auth/current", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/charts/market", () => ({
  isListedSymbol: async (_db: unknown, s: string) => s === "BTCUSDT" || s === "ETHBTC",
  getOpenInterest: async () => {
    if (state.error) throw state.error;
    return [[1, 1000]];
  },
}));

import { GET } from "@/app/api/open-interest/route";
import { resetOpenInterestRouteLimits } from "@/lib/charts/route-limit";

const call = (q: string) => GET(new Request(`http://x/api/open-interest?${q}`));
beforeEach(() => {
  state.user = { id: 1 };
  state.error = null;
  resetOpenInterestRouteLimits();
});

describe("rota de open interest", () => {
  test("exige login; devolve a série de um par em USDT", async () => {
    state.user = null;
    expect((await call("symbol=BTCUSDT&interval=1h")).status).toBe(401);
    state.user = { id: 1 };
    const r = await call("symbol=BTCUSDT&interval=1h");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([[1, 1000]]);
  });

  test("valida par e tempo; só pares em USDT; par sem perpétuo → 404; Futures fora → 503", async () => {
    expect((await call("symbol=BTCUSDT&interval=7h")).status).toBe(400);
    expect((await call("symbol=ETHBTC&interval=1h")).status).toBe(404);
    expect((await call("symbol=XYZUSDT&interval=1h")).status).toBe(404);
    state.error = new BinanceError(400, "/futures/data/openInterestHist");
    expect((await call("symbol=BTCUSDT&interval=1h")).status).toBe(404);
    state.error = new Error("rede");
    expect((await call("symbol=BTCUSDT&interval=1h")).status).toBe(503);
  });
});
