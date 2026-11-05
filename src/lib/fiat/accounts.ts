import { and, asc, count, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { fiatAccounts, fiatBalances } from "@/db/schema";

export const MAX_ACCOUNTS = 50;

export type Result = { ok: true } | { ok: false; error: string };
export type FiatAccount = { id: number; name: string; amount: string; date: string };
export type BalancePoint = { date: string; amount: string };

const NOT_FOUND: Result = { ok: false, error: "Conta não encontrada" };
const DUPLICATE: Result = { ok: false, error: "Você já tem uma conta com esse nome" };

function owns(db: Db, userId: number, accountId: number): boolean {
  return !!db
    .select({ id: fiatAccounts.id })
    .from(fiatAccounts)
    .where(and(eq(fiatAccounts.id, accountId), eq(fiatAccounts.userId, userId)))
    .get();
}

function nameTaken(db: Db, userId: number, name: string, exceptId?: number): boolean {
  const row = db
    .select({ id: fiatAccounts.id })
    .from(fiatAccounts)
    .where(and(eq(fiatAccounts.userId, userId), eq(fiatAccounts.name, name)))
    .get();
  return !!row && row.id !== exceptId;
}

/** Histórico de saldos de cada conta da pessoa, do mais antigo ao mais novo. */
export function listBalances(db: Db, userId: number): Record<number, BalancePoint[]> {
  const rows = db
    .select({ accountId: fiatBalances.accountId, date: fiatBalances.date, amount: fiatBalances.amount })
    .from(fiatBalances)
    .innerJoin(fiatAccounts, eq(fiatAccounts.id, fiatBalances.accountId))
    .where(eq(fiatAccounts.userId, userId))
    .orderBy(asc(fiatBalances.date))
    .all();
  const out: Record<number, BalancePoint[]> = {};
  for (const r of rows) (out[r.accountId] ??= []).push({ date: r.date, amount: r.amount });
  return out;
}

/** Contas da pessoa com o saldo mais recente. */
export function listAccounts(db: Db, userId: number): FiatAccount[] {
  const accounts = db
    .select({ id: fiatAccounts.id, name: fiatAccounts.name })
    .from(fiatAccounts)
    .where(eq(fiatAccounts.userId, userId))
    .orderBy(asc(fiatAccounts.name))
    .all();
  const balances = listBalances(db, userId);
  return accounts.map((a) => {
    const last = balances[a.id]?.at(-1);
    return { ...a, amount: last?.amount ?? "0.00", date: last?.date ?? "" };
  });
}

function upsertBalance(db: Db, accountId: number, b: BalancePoint): void {
  const values = { amount: b.amount, createdAt: new Date() };
  db.insert(fiatBalances)
    .values({ accountId, date: b.date, ...values })
    .onConflictDoUpdate({ target: [fiatBalances.accountId, fiatBalances.date], set: values })
    .run();
}

export function createAccount(db: Db, userId: number, input: { name: string } & BalancePoint): Result {
  if (nameTaken(db, userId, input.name)) return DUPLICATE;
  const [{ n }] = db.select({ n: count() }).from(fiatAccounts).where(eq(fiatAccounts.userId, userId)).all();
  if (n >= MAX_ACCOUNTS) return { ok: false, error: `Limite de ${MAX_ACCOUNTS} contas atingido` };
  const [acc] = db.insert(fiatAccounts).values({ userId, name: input.name, createdAt: new Date() }).returning().all();
  upsertBalance(db, acc.id, input);
  return { ok: true };
}

export function setBalance(db: Db, userId: number, accountId: number, b: BalancePoint): Result {
  if (!owns(db, userId, accountId)) return NOT_FOUND;
  upsertBalance(db, accountId, b);
  return { ok: true };
}

export function renameAccount(db: Db, userId: number, accountId: number, name: string): Result {
  if (!owns(db, userId, accountId)) return NOT_FOUND;
  if (nameTaken(db, userId, name, accountId)) return DUPLICATE;
  db.update(fiatAccounts).set({ name }).where(eq(fiatAccounts.id, accountId)).run();
  return { ok: true };
}

export function deleteAccount(db: Db, userId: number, accountId: number): Result {
  if (!owns(db, userId, accountId)) return NOT_FOUND;
  db.delete(fiatAccounts).where(eq(fiatAccounts.id, accountId)).run();
  return { ok: true };
}
