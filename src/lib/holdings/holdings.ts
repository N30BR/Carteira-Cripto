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

const SCALE = 18;
/** Soma exata de dois decimais positivos em texto ("0.5" + "0.25" = "0.75"), sem erro de ponto flutuante. */
export function addDecimal(a: string, b: string): string {
  const toUnits = (x: string) => {
    const [i, d = ""] = x.split(".");
    return BigInt(i) * BigInt(10) ** BigInt(SCALE) + BigInt((d + "0".repeat(SCALE)).slice(0, SCALE) || "0");
  };
  const total = toUnits(a) + toUnits(b);
  const unit = BigInt(10) ** BigInt(SCALE);
  const int = total / unit;
  const frac = (total % unit).toString().padStart(SCALE, "0").replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int.toString();
}

/**
 * Transação: soma uma quantidade a um ativo que já está no portfólio (ex.: comprou mais 0,1 BTC).
 * Devolve a nova quantidade, ou um erro (ativo de outra pessoa/inexistente, ou total grande demais).
 */
export function addToHolding(db: Db, userId: number, holdingId: number, amount: string): { ok: true; quantity: string } | { ok: false; error: string } {
  const h = db
    .select({ quantity: holdings.quantity })
    .from(holdings)
    .where(and(eq(holdings.id, holdingId), eq(holdings.userId, userId)))
    .get();
  if (!h) return { ok: false, error: "Ativo não encontrado" };
  const quantity = addDecimal(h.quantity, amount);
  if (quantity.split(".")[0].length > 15) return { ok: false, error: "Quantidade total grande demais" };
  updateQuantity(db, userId, holdingId, quantity);
  return { ok: true, quantity };
}
