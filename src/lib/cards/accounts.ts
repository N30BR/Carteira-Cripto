import { and, asc, count, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cardAccounts, cardExpenses } from "@/db/schema";
import type { Result } from "./categories";

import { MAX_CARD_ACCOUNTS, type Side } from "./account-limits";

export { MAX_CARD_ACCOUNTS, type Side } from "./account-limits";
export type CardAccount = { id: number; name: string; kind: Side; closingDay: number | null; dueDay: number | null };
export const DEFAULT_ACCOUNTS: { name: string; kind: Side }[] = [
  { name: "Cartão PF", kind: "PF" },
  { name: "Cartão PJ", kind: "PJ" },
];

const NOT_FOUND: Result = { ok: false, error: "Conta não encontrada" };
const DUPLICATE: Result = { ok: false, error: "Já existe uma conta com esse nome" };

export function listCardAccounts(db: Db, userId: number): CardAccount[] {
  return db
    .select({ id: cardAccounts.id, name: cardAccounts.name, kind: cardAccounts.kind, closingDay: cardAccounts.closingDay, dueDay: cardAccounts.dueDay })
    .from(cardAccounts)
    .where(eq(cardAccounts.userId, userId))
    .orderBy(asc(cardAccounts.id))
    .all() as CardAccount[];
}

export function getCardAccount(db: Db, userId: number, id: number): CardAccount | null {
  return (
    (db
      .select({ id: cardAccounts.id, name: cardAccounts.name, kind: cardAccounts.kind, closingDay: cardAccounts.closingDay, dueDay: cardAccounts.dueDay })
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

// "Nubank" e "nubank" contam como o mesmo nome.
const sameName = (a: string, b: string) => a.toLocaleLowerCase("pt-BR") === b.toLocaleLowerCase("pt-BR");
const nameTaken = (db: Db, userId: number, name: string, exceptId?: number) =>
  listCardAccounts(db, userId).some((a) => sameName(a.name, name) && a.id !== exceptId);

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

/** Dia de vencimento da fatura da conta (1–31), ou null para limpar. */
export function setCardDueDay(db: Db, userId: number, id: number, day: number | null): Result {
  if (!getCardAccount(db, userId, id)) return NOT_FOUND;
  if (day !== null && !(Number.isInteger(day) && day >= 1 && day <= 31)) {
    return { ok: false, error: "O vencimento deve ser um dia de 1 a 31" };
  }
  db.update(cardAccounts).set({ dueDay: day }).where(eq(cardAccounts.id, id)).run();
  return { ok: true };
}

/** Dia de fechamento da fatura da conta (1–31), ou null para limpar. */
export function setCardClosingDay(db: Db, userId: number, id: number, day: number | null): Result {
  if (!getCardAccount(db, userId, id)) return NOT_FOUND;
  if (day !== null && !(Number.isInteger(day) && day >= 1 && day <= 31)) {
    return { ok: false, error: "O fechamento deve ser um dia de 1 a 31" };
  }
  db.update(cardAccounts).set({ closingDay: day }).where(eq(cardAccounts.id, id)).run();
  return { ok: true };
}
