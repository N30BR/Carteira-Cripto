import { and, between, count, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { transactions } from "@/db/schema";
import type { TxKind } from "./calc";

export type { TxKind } from "./calc";
export type Result = { ok: true } | { ok: false; error: string };
export type Transaction = { id: number; date: string; kind: TxKind; description: string; amountCents: number };
export type TransactionInput = Omit<Transaction, "id">;

export const MAX_TRANSACTIONS = 5000;
const NOT_FOUND: Result = { ok: false, error: "Transação não encontrada" };

function owns(db: Db, userId: number, id: number): boolean {
  return !!db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .get();
}

export function createTransaction(db: Db, userId: number, t: TransactionInput): Result {
  const [{ n }] = db.select({ n: count() }).from(transactions).where(eq(transactions.userId, userId)).all();
  if (n >= MAX_TRANSACTIONS) return { ok: false, error: `Limite de ${MAX_TRANSACTIONS} transações atingido` };
  const now = new Date();
  db.insert(transactions).values({ userId, ...t, createdAt: now, updatedAt: now }).run();
  return { ok: true };
}

export function updateTransaction(db: Db, userId: number, id: number, t: TransactionInput): Result {
  if (!owns(db, userId, id)) return NOT_FOUND;
  db.update(transactions)
    .set({ ...t, updatedAt: new Date() })
    .where(eq(transactions.id, id))
    .run();
  return { ok: true };
}

export function deleteTransaction(db: Db, userId: number, id: number): Result {
  if (!owns(db, userId, id)) return NOT_FOUND;
  db.delete(transactions).where(eq(transactions.id, id)).run();
  return { ok: true };
}

/** Transações da pessoa entre as datas (inclusive), da mais recente para a mais antiga. */
export function listTransactions(db: Db, userId: number, fromDate: string, toDate: string): Transaction[] {
  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      kind: transactions.kind,
      description: transactions.description,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), between(transactions.date, fromDate, toDate)))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .all() as Transaction[];
}
