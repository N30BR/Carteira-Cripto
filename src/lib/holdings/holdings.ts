import { and, count, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { holdings } from "@/db/schema";

export const MAX_HOLDINGS = 100;

export type Holding = { id: number; coinId: string; symbol: string; name: string; quantity: string };

export function listHoldings(db: Db, userId: number): Holding[] {
  return db
    .select({
      id: holdings.id,
      coinId: holdings.coinId,
      symbol: holdings.symbol,
      name: holdings.name,
      quantity: holdings.quantity,
    })
    .from(holdings)
    .where(eq(holdings.userId, userId))
    .orderBy(holdings.name)
    .all();
}

export function upsertHolding(
  db: Db,
  userId: number,
  h: { coinId: string; symbol: string; name: string; quantity: string },
): { ok: true } | { ok: false; error: string } {
  const now = new Date();
  const existing = db
    .select({ id: holdings.id })
    .from(holdings)
    .where(and(eq(holdings.userId, userId), eq(holdings.coinId, h.coinId)))
    .get();
  if (existing) {
    db.update(holdings).set({ quantity: h.quantity, updatedAt: now }).where(eq(holdings.id, existing.id)).run();
    return { ok: true };
  }
  const [{ n }] = db.select({ n: count() }).from(holdings).where(eq(holdings.userId, userId)).all();
  if (n >= MAX_HOLDINGS) return { ok: false, error: `Limite de ${MAX_HOLDINGS} ativos atingido` };
  db.insert(holdings).values({ userId, ...h, updatedAt: now }).run();
  return { ok: true };
}

export function updateQuantity(db: Db, userId: number, holdingId: number, quantity: string): boolean {
  const r = db
    .update(holdings)
    .set({ quantity, updatedAt: new Date() })
    .where(and(eq(holdings.id, holdingId), eq(holdings.userId, userId)))
    .run();
  return r.changes > 0;
}

export function deleteHolding(db: Db, userId: number, holdingId: number): boolean {
  const r = db.delete(holdings).where(and(eq(holdings.id, holdingId), eq(holdings.userId, userId))).run();
  return r.changes > 0;
}
