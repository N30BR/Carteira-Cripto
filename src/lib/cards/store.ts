import { and, asc, between, count, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cardAccounts, cardCategories, cardExpenses, cardInstallments } from "@/db/schema";
import { getCardAccount, type Side } from "./accounts";
import { ownsCategory, type Result } from "./categories";
import { buildInstallments } from "./installments";

export const MAX_EXPENSES = 2000;

export type { Side } from "./accounts";

export type ExpenseInput = {
  description: string;
  totalCents: number;
  installments: number;
  firstInvoice: string;
  purchaseDate: string;
  /** Conta/cartão da compra; o tipo dela (PF/PJ) vira a natureza da compra. */
  accountId: number;
  categoryId: number | null;
  notes: string;
  /** Parcelas que nascem pagas (na edição, só valem para números que ainda não existiam). */
  paidNumbers: number[];
};

export type InstallmentRow = {
  installmentId: number;
  expenseId: number;
  number: number;
  installments: number;
  invoiceMonth: string;
  amountCents: number;
  paid: boolean;
  description: string;
  nature: Side;
  card: Side;
  accountId: number;
  accountName: string;
  categoryId: number | null;
  categoryName: string | null;
  notes: string;
  purchaseDate: string;
  firstInvoice: string;
  totalCents: number;
};

const NOT_FOUND: Result = { ok: false, error: "Lançamento não encontrado" };
const BAD_CATEGORY: Result = { ok: false, error: "Categoria inválida" };
const BAD_ACCOUNT: Result = { ok: false, error: "Conta inválida" };

function ownsExpense(db: Db, userId: number, id: number): boolean {
  return !!db
    .select({ id: cardExpenses.id })
    .from(cardExpenses)
    .where(and(eq(cardExpenses.id, id), eq(cardExpenses.userId, userId)))
    .get();
}

function fields(e: ExpenseInput, nature: Side, kind: Side) {
  return {
    description: e.description,
    totalCents: e.totalCents,
    installments: e.installments,
    firstInvoice: e.firstInvoice,
    purchaseDate: e.purchaseDate,
    accountId: e.accountId,
    // card guarda o tipo da conta (coluna antiga, mantida para o histórico).
    card: kind,
    nature,
    categoryId: e.categoryId,
    notes: e.notes,
  };
}

function writeInstallments(db: Db, expenseId: number, e: ExpenseInput, keepPaid: Map<number, boolean>): void {
  db.delete(cardInstallments).where(eq(cardInstallments.expenseId, expenseId)).run();
  const paidNew = new Set(e.paidNumbers);
  db.insert(cardInstallments)
    .values(
      buildInstallments(e.totalCents, e.installments, e.firstInvoice).map((p) => ({
        expenseId,
        number: p.number,
        invoiceMonth: p.invoiceMonth,
        amountCents: p.amountCents,
        paid: keepPaid.get(p.number) ?? paidNew.has(p.number),
      })),
    )
    .run();
}

export function createExpense(db: Db, userId: number, e: ExpenseInput): Result {
  const account = getCardAccount(db, userId, e.accountId);
  if (!account) return BAD_ACCOUNT;
  if (e.categoryId !== null && !ownsCategory(db, userId, e.categoryId)) return BAD_CATEGORY;
  const [{ n }] = db.select({ n: count() }).from(cardExpenses).where(eq(cardExpenses.userId, userId)).all();
  if (n >= MAX_EXPENSES) return { ok: false, error: `Limite de ${MAX_EXPENSES} lançamentos atingido` };
  db.transaction((tx) => {
    const [row] = tx.insert(cardExpenses).values({ userId, ...fields(e, account.kind, account.kind), createdAt: new Date() }).returning().all();
    writeInstallments(tx as unknown as Db, row.id, e, new Map());
  });
  return { ok: true };
}

/**
 * Recalcula as parcelas mantendo o status de pago de cada número que continua existindo.
 * Na mesma conta, a natureza da compra fica como estava; trocando de conta, passa a ser o tipo da nova.
 */
export function updateExpense(db: Db, userId: number, id: number, e: ExpenseInput): Result {
  const current = getExpense(db, userId, id);
  if (!current) return NOT_FOUND;
  const account = getCardAccount(db, userId, e.accountId);
  if (!account) return BAD_ACCOUNT;
  if (e.categoryId !== null && !ownsCategory(db, userId, e.categoryId)) return BAD_CATEGORY;
  const nature = current.accountId === account.id ? (current.nature as Side) : account.kind;
  const previous = db
    .select({ number: cardInstallments.number, paid: cardInstallments.paid })
    .from(cardInstallments)
    .where(eq(cardInstallments.expenseId, id))
    .all();
  db.transaction((tx) => {
    tx.update(cardExpenses).set(fields(e, nature, account.kind)).where(eq(cardExpenses.id, id)).run();
    writeInstallments(tx as unknown as Db, id, e, new Map(previous.map((p) => [p.number, p.paid])));
  });
  return { ok: true };
}

/** A pessoa já lançou alguma compra (de qualquer época)? */
export function hasExpenses(db: Db, userId: number): boolean {
  return !!db.select({ id: cardExpenses.id }).from(cardExpenses).where(eq(cardExpenses.userId, userId)).limit(1).get();
}

export function deleteExpense(db: Db, userId: number, id: number): Result {
  if (!ownsExpense(db, userId, id)) return NOT_FOUND;
  db.delete(cardExpenses).where(eq(cardExpenses.id, id)).run();
  return { ok: true };
}

export function setInstallmentPaid(db: Db, userId: number, installmentId: number, paid: boolean): Result {
  const row = db
    .select({ id: cardInstallments.id })
    .from(cardInstallments)
    .innerJoin(cardExpenses, eq(cardExpenses.id, cardInstallments.expenseId))
    .where(and(eq(cardInstallments.id, installmentId), eq(cardExpenses.userId, userId)))
    .get();
  if (!row) return NOT_FOUND;
  db.update(cardInstallments).set({ paid }).where(eq(cardInstallments.id, installmentId)).run();
  return { ok: true };
}

export function getExpense(db: Db, userId: number, id: number) {
  return (
    db
      .select()
      .from(cardExpenses)
      .where(and(eq(cardExpenses.id, id), eq(cardExpenses.userId, userId)))
      .get() ?? null
  );
}

/** Parcelas da pessoa com fatura entre os meses indicados (inclusive), com os dados da compra. */
export function listInstallments(db: Db, userId: number, fromMonth: string, toMonth: string): InstallmentRow[] {
  return db
    .select({
      installmentId: cardInstallments.id,
      expenseId: cardExpenses.id,
      number: cardInstallments.number,
      installments: cardExpenses.installments,
      invoiceMonth: cardInstallments.invoiceMonth,
      amountCents: cardInstallments.amountCents,
      paid: cardInstallments.paid,
      description: cardExpenses.description,
      nature: cardExpenses.nature,
      card: cardExpenses.card,
      accountId: cardExpenses.accountId,
      accountName: cardAccounts.name,
      categoryId: cardExpenses.categoryId,
      categoryName: cardCategories.name,
      notes: cardExpenses.notes,
      purchaseDate: cardExpenses.purchaseDate,
      firstInvoice: cardExpenses.firstInvoice,
      totalCents: cardExpenses.totalCents,
    })
    .from(cardInstallments)
    .innerJoin(cardExpenses, eq(cardExpenses.id, cardInstallments.expenseId))
    .innerJoin(cardAccounts, eq(cardAccounts.id, cardExpenses.accountId))
    .leftJoin(cardCategories, eq(cardCategories.id, cardExpenses.categoryId))
    .where(and(eq(cardExpenses.userId, userId), between(cardInstallments.invoiceMonth, fromMonth, toMonth)))
    .orderBy(asc(cardInstallments.invoiceMonth), asc(cardExpenses.description), asc(cardInstallments.number))
    .all() as InstallmentRow[];
}
