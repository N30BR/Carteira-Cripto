import { beforeEach, describe, expect, test, vi } from "vitest";
import { testDb } from "../helpers/db";
import { users } from "@/db/schema";
import { listHoldings } from "@/lib/holdings/holdings";

const state = vi.hoisted(() => ({ db: null as unknown, userId: 0 }));
vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: () => state.db }));
vi.mock("@/lib/auth/current", () => ({ requireUser: async () => ({ id: state.userId }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/prices", () => ({ isListedAsset: async (_db: unknown, id: string) => ["BTC", "SOL"].includes(id) }));

import { addHoldingAction } from "@/app/(app)/ativos/actions";

describe("addHoldingAction", () => {
  beforeEach(() => {
    const db = testDb();
    state.db = db;
    state.userId = db.insert(users).values({ username: "ana", passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0].id;
  });

  test("grava com nome e símbolo definidos no servidor", async () => {
    expect(await addHoldingAction("BTC", "0,5")).toEqual({ ok: true });
    expect(listHoldings(state.db as never, state.userId)[0]).toMatchObject({ coinId: "BTC", symbol: "BTC", name: "Bitcoin", quantity: "0.5" });
  });

  test("recusa moeda que não está listada na Binance", async () => {
    expect(await addHoldingAction("NADA", "1")).toEqual({ ok: false, error: "Moeda não encontrada na Binance" });
    expect(listHoldings(state.db as never, state.userId)).toEqual([]);
  });

  test("recusa id malformado sem lançar erro", async () => {
    expect((await addHoldingAction(123 as unknown as string, "1")).ok).toBe(false);
    expect((await addHoldingAction("btc; drop", "1")).ok).toBe(false);
  });
});

describe("addHoldingAction com a Binance fora do ar", () => {
  test("não diz que a moeda não existe quando a lista está indisponível", async () => {
    const prices = await import("@/lib/prices");
    const spy = vi.spyOn(prices, "isListedAsset").mockResolvedValueOnce(null);
    const db = testDb();
    state.db = db;
    state.userId = db.insert(users).values({ username: "bia", passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0].id;
    expect(await addHoldingAction("BTC", "1")).toEqual({
      ok: false,
      error: "Não foi possível consultar a Binance agora. Tente de novo em instantes.",
    });
    spy.mockRestore();
  });
});
