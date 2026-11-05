import { describe, expect, test } from "vitest";
import { testDb } from "../helpers/db";
import { users } from "@/db/schema";
import { MAX_HOLDINGS, deleteHolding, listHoldings, updateQuantity, upsertHolding } from "@/lib/holdings/holdings";

function setup() {
  const db = testDb();
  const mk = (username: string) =>
    db.insert(users).values({ username, passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0];
  return { db, a: mk("ana"), b: mk("bia") };
}
const btc = (quantity: string) => ({ coinId: "bitcoin", symbol: "btc", name: "Bitcoin", quantity });

describe("holdings", () => {
  test("adicionar a mesma moeda atualiza em vez de duplicar", () => {
    const { db, a } = setup();
    expect(upsertHolding(db, a.id, btc("0.5"))).toEqual({ ok: true });
    expect(upsertHolding(db, a.id, btc("1"))).toEqual({ ok: true });
    const list = listHoldings(db, a.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ coinId: "bitcoin", symbol: "btc", name: "Bitcoin", quantity: "1" });
  });

  test("limite de 100 ativos por usuário", () => {
    const { db, a } = setup();
    for (let i = 0; i < MAX_HOLDINGS; i++) {
      upsertHolding(db, a.id, { coinId: `c${i}`, symbol: `c${i}`, name: `C${i}`, quantity: "1" });
    }
    expect(upsertHolding(db, a.id, { coinId: "extra", symbol: "x", name: "X", quantity: "1" })).toEqual({
      ok: false,
      error: "Limite de 100 ativos atingido",
    });
    expect(upsertHolding(db, a.id, { coinId: "c0", symbol: "c0", name: "C0", quantity: "2" })).toEqual({ ok: true });
  });

  test("um usuário não altera nem vê a carteira de outro", () => {
    const { db, a, b } = setup();
    upsertHolding(db, a.id, btc("0.5"));
    const id = listHoldings(db, a.id)[0].id;
    expect(updateQuantity(db, b.id, id, "99")).toBe(false);
    expect(deleteHolding(db, b.id, id)).toBe(false);
    expect(listHoldings(db, b.id)).toEqual([]);
    expect(listHoldings(db, a.id)[0].quantity).toBe("0.5");
  });

  test("dono atualiza e remove", () => {
    const { db, a } = setup();
    upsertHolding(db, a.id, btc("0.5"));
    const id = listHoldings(db, a.id)[0].id;
    expect(updateQuantity(db, a.id, id, "2")).toBe(true);
    expect(listHoldings(db, a.id)[0].quantity).toBe("2");
    expect(deleteHolding(db, a.id, id)).toBe(true);
    expect(listHoldings(db, a.id)).toEqual([]);
  });
});
