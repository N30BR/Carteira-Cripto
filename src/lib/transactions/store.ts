import { and, between, count, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { fiatAccounts, transactions } from "@/db/schema";
import { deleteMovement, ownsFiatAccount, txSource, upsertMovement } from "@/lib/fiat/movements";
import type { TxKind } from "./calc";

export type { TxKind } from "./calc";
export type Result = { ok: true } | { ok: false; error: string };
export type Transaction = {
  id: number;
  date: string;
  kind: TxKind;
  description: string;
  amountCents: number;
  /** Conta do R$ (destino da entrada / origem da saída); null = sem conta (não mexe em saldo). */
  accountId: number | null;
  accountName?: string | null;
};
export type TransactionInput = Omit<Transaction, "id" | "accountName">;

export const MAX_TRANSACTIONS = 5000;
const NOT_FOUND: Result = { ok: false, error: "Transação não encontrada" };
const BAD_ACCOUNT: Result = { ok: false, error: "Conta inválida" };

function owns(db: Db, userId: number, id: number): boolean {
  return !!db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .get();
}

/** Entrada soma na conta; saída subtrai. Sem conta: nenhuma movimentação. */
function syncMovement(db: Db, userId: number, id: number, t: TransactionInput): void {
  if (t.accountId === null) return deleteMovement(db, txSource(id));
  upsertMovement(db, userId, txSource(id), { accountId: t.accountId, date: t.date, amountCents: t.kind === "in" ? t.amountCents : -t.amountCents });
}

export function createTransaction(db: Db, userId: number, t: TransactionInput): Result {
  if (t.accountId !== null && !ownsFiatAccount(db, userId, t.accountId)) return BAD_ACCOUNT;
  const [{ n }] = db.select({ n: count() }).from(transactions).where(eq(transactions.userId, userId)).all();
  if (n >= MAX_TRANSACTIONS) return { ok: false, error: `Limite de ${MAX_TRANSACTIONS} transações atingido` };
  const now = new Date();
  // Sem conta: só o registro (nenhuma movimentação a criar).
  if (t.accountId === null) {
    db.insert(transactions).values({ userId, ...t, createdAt: now, updatedAt: now }).run();
    return { ok: true };
  }
  db.transaction((tx) => {
    const [row] = tx.insert(transactions).values({ userId, ...t, createdAt: now, updatedAt: now }).returning({ id: transactions.id }).all();
    syncMovement(tx as unknown as Db, userId, row.id, t);
  });
  return { ok: true };
}

export function updateTransaction(db: Db, userId: number, id: number, t: TransactionInput): Result {
  if (!owns(db, userId, id)) return NOT_FOUND;
  if (t.accountId !== null && !ownsFiatAccount(db, userId, t.accountId)) return BAD_ACCOUNT;
  db.transaction((tx) => {
    tx.update(transactions)
      .set({ ...t, updatedAt: new Date() })
      .where(eq(transactions.id, id))
      .run();
    // Mesma movimentação, atualizada (valor, tipo, data ou conta): nunca conta duas vezes.
    syncMovement(tx as unknown as Db, userId, id, t);
  });
  return { ok: true };
}

export function deleteTransaction(db: Db, userId: number, id: number): Result {
  if (!owns(db, userId, id)) return NOT_FOUND;
  db.transaction((tx) => {
    // Estorno: sem a movimentação, o saldo da conta volta ao que era.
    deleteMovement(tx as unknown as Db, txSource(id));
    tx.delete(transactions).where(eq(transactions.id, id)).run();
  });
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
      accountId: transactions.accountId,
      accountName: fiatAccounts.name,
    })
    .from(transactions)
    .leftJoin(fiatAccounts, eq(fiatAccounts.id, transactions.accountId))
    .where(and(eq(transactions.userId, userId), between(transactions.date, fromDate, toDate)))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .all() as Transaction[];
}
