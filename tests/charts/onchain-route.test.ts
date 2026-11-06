import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { testDb } from "../helpers/db";

const state = vi.hoisted(() => ({ user: { id: 1 } as { id: number } | null, db: null as unknown }));
vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: () => state.db }));
vi.mock("@/lib/auth/current", () => ({ getCurrentUser: async () => state.user }));
const modules = vi.hoisted(() => ({ chartsOn: true }));
vi.mock("@/lib/auth/modules", () => ({ moduleOn: () => modules.chartsOn }));

import { GET } from "@/app/api/onchain/route";
import { getOnchainSeries, resetOnchainFailures } from "@/lib/charts/onchain";
import { BG_LIMITS, spendBudget } from "@/lib/charts/onchain-budget";
import { resetOnchainRouteLimits } from "@/lib/charts/route-limit";
import type { Db } from "@/db/client";

const call = (q: string) => GET(new Request(`http://x/api/onchain?${q}`));
const realFetch = globalThis.fetch;
let calls: string[] = [];
const T = Date.parse("2024-01-01T00:00:00Z");
const DAY = 86_400_000;

// Coin Metrics: MVRV 2, valor de mercado 800, oferta 4 → preço realizado 100; NUPL 0,5.
const cmBody = { data: [{ asset: "btc", time: "2024-01-01T00:00:00.000000000Z", CapMVRVCur: "2", CapMrktCurUSD: "800", SplyCur: "4" }] };
let bgRealized = 101; // perto do cálculo (1%)
let bgStatus = 200;

beforeEach(() => {
  modules.chartsOn = true;
  state.user = { id: 1 };
  state.db = testDb();
  calls = [];
  bgRealized = 101;
  bgStatus = 200;
  resetOnchainRouteLimits();
  resetOnchainFailures();
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("coinmetrics")) return new Response(JSON.stringify(cmBody));
    if (bgStatus !== 200) return new Response(JSON.stringify({ error: { status: bgStatus } }), { status: bgStatus });
    if (u.endsWith("/v1/realized-price")) return new Response(JSON.stringify([{ d: "2024-01-01", unixTs: T / 1000, realizedPrice: bgRealized }]));
    if (u.endsWith("/v1/sopr")) return new Response(JSON.stringify([{ d: "2024-01-01", unixTs: T / 1000, sopr: 1.02 }]));
    return new Response(JSON.stringify([{ d: "2024-01-01", unixTs: T / 1000, valor: 0.5 }]));
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const db = () => state.db as Db;
const exhaust = (now: Date) => {
  for (let i = 0; i < BG_LIMITS.perDay; i++) spendBudget(db(), now, "bgeometrics");
};

describe("rota de indicadores on-chain", () => {
  test("exige login, Gráficos ligado e um indicador da lista", async () => {
    state.user = null;
    expect((await call("id=NUPL")).status).toBe(401);
    state.user = { id: 1 };
    modules.chartsOn = false;
    expect((await call("id=NUPL")).status).toBe(404);
    modules.chartsOn = true;
    expect((await call("id=HACK")).status).toBe(400);
  });

  test("com cota: usa a BGeometrics e confere o cálculo próprio", async () => {
    const r = await call("id=REALIZED_PRICE");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ source: "bgeometrics", stale: false, points: [[T, 101]] });
  });

  test("cota da BGeometrics acabou e o cálculo estava perto: usa o cálculo próprio", async () => {
    const now = new Date(T + 2 * 3_600_000);
    await getOnchainSeries(db(), "REALIZED_PRICE", now); // confere (101 × 100 → 1%)
    const later = new Date(now.getTime() + 2 * DAY);
    exhaust(later);
    const r = await getOnchainSeries(db(), "REALIZED_PRICE", later);
    expect(r).toMatchObject({ source: "calculo", points: [[T, 100]] });
    expect(r.note).toMatch(/conferido com a BGeometrics/);
  });

  test("cota acabou mas o cálculo estava longe: fica com os últimos dados da BGeometrics", async () => {
    bgRealized = 150; // 33% de diferença
    const now = new Date(T + 2 * 3_600_000);
    await getOnchainSeries(db(), "REALIZED_PRICE", now);
    const later = new Date(now.getTime() + 2 * DAY);
    exhaust(later);
    const r = await getOnchainSeries(db(), "REALIZED_PRICE", later);
    expect(r).toMatchObject({ source: "bgeometrics", stale: true, points: [[T, 150]] });
  });

  test("séries só da BGeometrics: sem cota e sem dados guardados → 503 (nada inventado)", async () => {
    exhaust(new Date());
    const r = await call("id=SOPR");
    expect(r.status).toBe(503);
    expect(calls.filter((u) => u.includes("bitcoin-data"))).toHaveLength(0);
  });

  test("falha da BGeometrics: pausa antes de tentar de novo (não gasta a cota)", async () => {
    bgStatus = 429;
    expect((await call("id=SOPR")).status).toBe(503);
    await call("id=SOPR");
    expect(calls.filter((u) => u.includes("bitcoin-data"))).toHaveLength(1);
  });

  test("netflow vem da Coin Metrics", async () => {
    const r = await call("id=EXCHANGE_NETFLOW");
    expect(r.status).toBe(200);
    expect((await r.json()).source).toBe("coinmetrics");
  });
});
