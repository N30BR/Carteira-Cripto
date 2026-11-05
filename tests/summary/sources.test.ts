import { describe, expect, test, vi } from "vitest";
import { testDb } from "../helpers/db";
import { users } from "@/db/schema";
import { upsertHolding } from "@/lib/holdings/holdings";

const DAY = 86_400_000;
const now = new Date("2026-11-20T12:00:00Z");
const fetched = new Date("2026-11-20T11:30:00Z");
const mocks = vi.hoisted(() => ({ stale: false, period: "" }));
vi.mock("@/lib/prices", () => ({
  getCurrentPrices: async () => ({ prices: { BTC: { usd: 60000, change24h: 0 } }, fetchedAt: fetched, stale: mocks.stale }),
  getHistory: async (_db: unknown, _ids: string[], period: string) => {
    mocks.period = period;
    // BTC a 40.000 até 15 dias atrás, depois 50.000.
    return {
      history: {
        BTC: [
          [now.getTime() - 300 * DAY, 40000],
          [now.getTime() - 15 * DAY, 50000],
        ],
      },
      oldestFetchedAt: fetched,
      stale: false,
    };
  },
}));

import { cryptoPeriod } from "@/lib/summary/sources";

function setup() {
  const db = testDb();
  const u = db.insert(users).values({ username: "ana", passwordHash: "x", isAdmin: false, createdAt: now }).returning().all()[0].id;
  upsertHolding(db, u, { coinId: "BTC", symbol: "BTC", name: "Bitcoin", quantity: "0.5" });
  return { db, u };
}

describe("cripto no período do Resumo", () => {
  test("período em andamento: valor no início (preço da época) e agora (preço atual)", async () => {
    const { db, u } = setup();
    const start = now.getTime() - 19 * DAY;
    const r = await cryptoPeriod(db, u, start, now.getTime() + 11 * DAY, now);
    expect(r).toMatchObject({ startUsdt: 20000, endUsdt: 30000, endMs: now.getTime(), stale: false, reason: null });
    expect(mocks.period).toBe("1M"); // até 29 dias: velas de 1 hora
  });

  test("período já encerrado: fim pelo preço da época; meses atrás usam o histórico diário", async () => {
    const { db, u } = setup();
    const start = now.getTime() - 100 * DAY;
    const r = await cryptoPeriod(db, u, start, now.getTime() - 10 * DAY, now);
    expect(r).toMatchObject({ startUsdt: 20000, endUsdt: 25000 });
    expect(mocks.period).toBe("1A");
  });

  test("período que ainda não começou: saldo atual, sem variação", async () => {
    const { db, u } = setup();
    const r = await cryptoPeriod(db, u, now.getTime() + 5 * DAY, now.getTime() + 35 * DAY, now);
    expect(r).toMatchObject({ startUsdt: 30000, endUsdt: 30000 });
  });

  test("mais de um ano atrás: sem histórico, fica indisponível", async () => {
    const { db, u } = setup();
    const r = await cryptoPeriod(db, u, now.getTime() - 400 * DAY, now.getTime() - 370 * DAY, now);
    expect(r).toMatchObject({ startUsdt: null, endUsdt: null, reason: "Sem histórico de preços tão antigo" });
  });

  test("preços vindos de cache antigo marcam o resultado como desatualizado", async () => {
    const { db, u } = setup();
    mocks.stale = true;
    expect(await cryptoPeriod(db, u, now.getTime() - 5 * DAY, now.getTime(), now)).toMatchObject({ stale: true });
    mocks.stale = false;
  });
});
