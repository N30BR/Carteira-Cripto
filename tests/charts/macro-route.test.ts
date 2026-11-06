import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { testDb } from "../helpers/db";

const state = vi.hoisted(() => ({ user: { id: 1 } as { id: number } | null, db: null as unknown }));
vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: () => state.db }));
vi.mock("@/lib/auth/current", () => ({ getCurrentUser: async () => state.user }));
const modules = vi.hoisted(() => ({ chartsOn: true }));
vi.mock("@/lib/auth/modules", () => ({ moduleOn: () => modules.chartsOn }));

import { GET } from "@/app/api/macro/route";
import { resetMacroRouteLimits } from "@/lib/charts/route-limit";

const KEY = "abcdefabcdefabcdefabcdefabcdef12";
const call = (q: string) => GET(new Request(`http://x/api/macro?${q}`));
const realFetch = globalThis.fetch;

beforeEach(() => {
  modules.chartsOn = true;
  state.user = { id: 1 };
  state.db = testDb();
  resetMacroRouteLimits();
  process.env.FRED_API_KEY = KEY;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.FRED_API_KEY;
});

describe("rota de séries macro", () => {
  test("exige login e uma série da lista", async () => {
    state.user = null;
    expect((await call("id=UST10Y")).status).toBe(401);
    state.user = { id: 1 };
    expect((await call("id=HACK")).status).toBe(400);
  });

  test("devolve a série do FRED (a chave só vai na chamada ao FRED, nunca na resposta)", async () => {
    let calledWith = "";
    globalThis.fetch = (async (url: string) => {
      calledWith = String(url);
      return new Response(JSON.stringify({ observations: [{ date: "2026-01-02", value: "4.5" }] }));
    }) as typeof fetch;
    const r = await call("id=UST10Y");
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(JSON.parse(text)).toEqual([[Date.parse("2026-01-02T00:00:00Z"), 4.5]]);
    expect(text).not.toContain(KEY);
    expect(calledWith).toContain("series_id=DGS10");
  });

  test("sem chave ou FRED fora do ar → 503, sem vazar a chave", async () => {
    globalThis.fetch = (async () => {
      throw new Error(`falhou https://api.stlouisfed.org/?api_key=${KEY}`);
    }) as typeof fetch;
    const r = await call("id=FED_FUNDS");
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain(KEY);
    delete process.env.FRED_API_KEY;
    expect((await call("id=US_M2")).status).toBe(503);
  });
});
