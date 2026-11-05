import { and, asc, count, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cardAccounts, cardExpenses } from "@/db/schema";
import type { Result } from "./categories";

export type Side = "PF" | "PJ";
export type CardAccount = { id: number; name: string; kind: Side };

export const MAX_CARD_ACCOUNTS = 4;
export const DEFAULT_ACCOUNTS: { name: string; kind: Side }[] = [
  { name: "Cartão PF", kind: "PF" },
  { name: "Cartão PJ", kind: "PJ" },
];

const NOT_FOUND: Result = { ok: false, error: "Conta não encontrada" };
const DUPLICATE: Result = { ok: false, error: "Já existe uma conta com esse nome" };

export function listCardAccounts(db: Db, userId: number): CardAccount[] {
  return db
    .select({ id: cardAccounts.id, name: cardAccounts.name, kind: cardAccounts.kind })
    .from(cardAccounts)
    .where(eq(cardAccounts.userId, userId))
    .orderBy(asc(cardAccounts.id))
    .all() as CardAccount[];
}

export function getCardAccount(db: Db, userId: number, id: number): CardAccount | null {
  return (
    (db
      .select({ id: cardAccounts.id, name: cardAccounts.name, kind: cardAccounts.kind })
      .from(cardAccounts)
      .where(and(eq(cardAccounts.id, id), eq(cardAccounts.userId, userId)))
      .get() as CardAccount | undefined) ?? null
  );
}

/** Quem ainda não tem conta nenhuma ganha "Cartão PF" e "Cartão PJ" (sempre fica ao menos uma conta). */
export function ensureDefaultAccounts(db: Db, userId: number): void {
  const [{ n }] = db.select({ n: count() }).from(cardAccounts).where(eq(cardAccounts.userId, userId)).all();
  if (n > 0) return;
  const now = new Date();
  db.insert(cardAccounts)
    .values(DEFAULT_ACCOUNTS.map((a) => ({ userId, ...a, createdAt: now })))
    .run();
}

const nameTaken = (db: Db, userId: number, name: string, exceptId?: number) =>
  listCardAccounts(db, userId).some((a) => a.name === name && a.id !== exceptId);

export function createCardAccount(db: Db, userId: number, a: { name: string; kind: Side }): Result {
  const accounts = listCardAccounts(db, userId);
  if (accounts.length >= MAX_CARD_ACCOUNTS) return { ok: false, error: `Limite de ${MAX_CARD_ACCOUNTS} contas atingido` };
  if (nameTaken(db, userId, a.name)) return DUPLICATE;
  db.insert(cardAccounts).values({ userId, name: a.name, kind: a.kind, createdAt: new Date() }).run();
  return { ok: true };
}

/** Renomeia ou troca o tipo; vale para as próximas compras (as já lançadas mantêm a natureza que têm). */
export function updateCardAccount(db: Db, userId: number, id: number, a: { name: string; kind: Side }): Result {
  if (!getCardAccount(db, userId, id)) return NOT_FOUND;
  if (nameTaken(db, userId, a.name, id)) return DUPLICATE;
  db.update(cardAccounts).set({ name: a.name, kind: a.kind }).where(eq(cardAccounts.id, id)).run();
  return { ok: true };
}

export function deleteCardAccount(db: Db, userId: number, id: number): Result {
  if (!getCardAccount(db, userId, id)) return NOT_FOUND;
  const [{ used }] = db.select({ used: count() }).from(cardExpenses).where(eq(cardExpenses.accountId, id)).all();
  if (used > 0) {
    return { ok: false, error: "Esta conta tem lançamentos. Mova ou exclua os lançamentos antes de excluir a conta." };
  }
  if (listCardAccounts(db, userId).length <= 1) return { ok: false, error: "Mantenha pelo menos uma conta" };
  db.delete(cardAccounts).where(eq(cardAccounts.id, id)).run();
  return { ok: true };
}
