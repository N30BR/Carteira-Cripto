import { describe, expect, test, vi } from "vitest";
import { testDb } from "../helpers/db";
import { users } from "@/db/schema";
import { upsertHolding } from "@/lib/holdings/holdings";

const t = new Date("2026-11-05T12:00:00Z");
const old = new Date("2026-11-04T09:00:00Z");
const mocks = vi.hoisted(() => ({ pricesStale: false, ratesStale: false, usdtBrl: 5 as number | null }));
vi.mock("@/lib/prices", () => ({
  getCurrentPrices: async () => ({ prices: { BTC: { usd: 60000, change24h: 0 } }, fetchedAt: mocks.pricesStale ? old : t, stale: mocks.pricesStale }),
}));
vi.mock("@/lib/prices/rates", () => ({
  getRates: async () => ({ usdtBrl: mocks.usdtBrl, btcUsdt: 60000, usdtBrlChange24h: 0, btcUsdtChange24h: 0, fetchedAt: mocks.ratesStale ? old : t, stale: mocks.ratesStale }),
}));

import { cryptoBalanceBrl } from "@/lib/summary/sources";

function setup() {
  const db = testDb();
  const u = db.insert(users).values({ username: "ana", passwordHash: "x", isAdmin: false, createdAt: t }).returning().all()[0].id;
  upsertHolding(db, u, { coinId: "BTC", symbol: "BTC", name: "Bitcoin", quantity: "0.5" });
  return { db, u };
}

describe("saldo cripto em reais", () => {
  test("converte pela cotação USDT/BRL e informa o horário", async () => {
    const { db, u } = setup();
    expect(await cryptoBalanceBrl(db, u, t)).toMatchObject({ cents: 15_000_000, usdt: 30000, usdtBrl: 5, asOf: t, stale: false });
  });

  test("preço ou cotação vindos de cache antigo marcam o saldo como desatualizado, com a data mais antiga", async () => {
    const { db, u } = setup();
    mocks.ratesStale = true;
    expect(await cryptoBalanceBrl(db, u, t)).toMatchObject({ cents: 15_000_000, stale: true, asOf: old });
    mocks.ratesStale = false;
  });

  test("sem cotação, não soma dólar com real", async () => {
    const { db, u } = setup();
    mocks.usdtBrl = null;
    expect(await cryptoBalanceBrl(db, u, t)).toMatchObject({ cents: null, reason: "Cotação USDT/BRL indisponível" });
    mocks.usdtBrl = 5;
  });
});
