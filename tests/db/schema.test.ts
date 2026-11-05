import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../helpers/db";
import { holdings, sessions, users } from "@/db/schema";

function addUser(db: ReturnType<typeof testDb>, username = "a") {
  const [u] = db
    .insert(users)
    .values({ username, passwordHash: "x", isAdmin: false, createdAt: new Date() })
    .returning()
    .all();
  return u;
}

describe("schema", () => {
  test("remover usuário apaga holdings e sessões (cascade)", () => {
    const db = testDb();
    const u = addUser(db);
    db.insert(holdings)
      .values({ userId: u.id, coinId: "bitcoin", symbol: "btc", name: "Bitcoin", quantity: "0.5", updatedAt: new Date() })
      .run();
    db.insert(sessions).values({ idHash: "h", userId: u.id, expiresAt: new Date() }).run();
    db.delete(users).where(eq(users.id, u.id)).run();
    expect(db.select().from(holdings).all()).toHaveLength(0);
    expect(db.select().from(sessions).all()).toHaveLength(0);
  });

  test("holding é única por (userId, coinId)", () => {
    const db = testDb();
    const u = addUser(db);
    const row = { userId: u.id, coinId: "bitcoin", symbol: "btc", name: "Bitcoin", quantity: "1", updatedAt: new Date() };
    db.insert(holdings).values(row).run();
    expect(() => db.insert(holdings).values(row).run()).toThrow();
  });

  test("usuários novos começam sem falhas e sem bloqueio", () => {
    const db = testDb();
    const u = addUser(db);
    expect(u.failedAttempts).toBe(0);
    expect(u.lockedUntil).toBeNull();
  });
});
