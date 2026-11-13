import { and, asc, between, count, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cardAccounts, cardCategories, cardExpenses, cardInstallments } from "@/db/schema";
import { getCardAccount, type Side } from "./accounts";
import { ownsCategory, type Result } from "./categories";
import { buildInstallments } from "./installments";
import { deleteMovement, deleteMovementsOfSource, fiatAccountForCard, getMovement, installmentSource, upsertMovement } from "@/lib/fiat/movements";

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
  /** Como o valor foi informado no formulário (para a edição mostrar igual). */
  amountMode?: "parcela" | "total";
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
  /** Quitada: encerrada sem mexer em saldo (exclusiva com paga). */
  settled: boolean;
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
  amountMode: string | null;
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
    ...(e.amountMode ? { amountMode: e.amountMode } : {}),
  };
}

type Kept = { paid: boolean; settled: boolean };

/**
 * Reescreve as parcelas da compra mantendo paga/quitada de cada número que continua existindo, e acerta as
 * movimentações da conta SÓ nas mudanças: virou paga → desconta; deixou de ser paga ou sumiu → estorna; continua
 * paga → atualiza valor/conta (mantém a data do pagamento). Parcelas pagas antes desta regra (sem movimentação)
 * não geram desconto retroativo.
 */
function writeInstallments(db: Db, userId: number, expenseId: number, e: ExpenseInput, kept: Map<number, Kept>, today: string): void {
  db.delete(cardInstallments).where(eq(cardInstallments.expenseId, expenseId)).run();
  const paidNew = new Set(e.paidNumbers);
  const parts = buildInstallments(e.totalCents, e.installments, e.firstInvoice).map((p) => {
    const k = kept.get(p.number);
    return { expenseId, number: p.number, invoiceMonth: p.invoiceMonth, amountCents: p.amountCents, paid: k ? k.paid : paidNew.has(p.number), settled: k?.settled ?? false };
  });
  db.insert(cardInstallments).values(parts).run();
  let fiat: number | null | undefined;
  const account = () => (fiat === undefined ? (fiat = fiatAccountForCard(db, userId, e.accountId)) : fiat);
  for (const p of parts) {
    const src = installmentSource(expenseId, p.number);
    const was = kept.get(p.number)?.paid ?? false;
    if (p.paid && !was) {
      const acc = account();
      if (acc) upsertMovement(db, userId, src, { accountId: acc, date: today, amountCents: -p.amountCents });
    } else if (!p.paid && was) deleteMovement(db, src);
    else if (p.paid && getMovement(db, src)) {
      const acc = account();
      if (acc) upsertMovement(db, userId, src, { accountId: acc, date: today, amountCents: -p.amountCents }, { keepDate: true });
    }
  }
  // Números que deixaram de existir (menos parcelas): estorna o que tinham.
  const alive = new Set(parts.map((p) => p.number));
  for (const n of kept.keys()) if (!alive.has(n)) deleteMovement(db, installmentSource(expenseId, n));
}

export function createExpense(db: Db, userId: number, e: ExpenseInput, today = new Date().toISOString().slice(0, 10)): Result {
  const account = getCardAccount(db, userId, e.accountId);
  if (!account) return BAD_ACCOUNT;
  if (e.categoryId !== null && !ownsCategory(db, userId, e.categoryId)) return BAD_CATEGORY;
  const [{ n }] = db.select({ n: count() }).from(cardExpenses).where(eq(cardExpenses.userId, userId)).all();
  if (n >= MAX_EXPENSES) return { ok: false, error: `Limite de ${MAX_EXPENSES} lançamentos atingido` };
  db.transaction((tx) => {
    const [row] = tx.insert(cardExpenses).values({ userId, ...fields(e, account.kind, account.kind), createdAt: new Date() }).returning().all();
    writeInstallments(tx as unknown as Db, userId, row.id, e, new Map(), today);
  });
  return { ok: true };
}

/**
 * Recalcula as parcelas mantendo o status de pago de cada número que continua existindo.
 * Na mesma conta, a natureza da compra fica como estava; trocando de conta, passa a ser o tipo da nova.
 */
export function updateExpense(db: Db, userId: number, id: number, e: ExpenseInput, today = new Date().toISOString().slice(0, 10)): Result {
  const current = getExpense(db, userId, id);
  if (!current) return NOT_FOUND;
  const account = getCardAccount(db, userId, e.accountId);
  if (!account) return BAD_ACCOUNT;
  if (e.categoryId !== null && !ownsCategory(db, userId, e.categoryId)) return BAD_CATEGORY;
  const nature = current.accountId === account.id ? (current.nature as Side) : account.kind;
  const previous = db
    .select({ number: cardInstallments.number, paid: cardInstallments.paid, settled: cardInstallments.settled })
    .from(cardInstallments)
    .where(eq(cardInstallments.expenseId, id))
    .all();
  db.transaction((tx) => {
    tx.update(cardExpenses).set(fields(e, nature, account.kind)).where(eq(cardExpenses.id, id)).run();
    writeInstallments(tx as unknown as Db, userId, id, e, new Map(previous.map((p) => [p.number, { paid: p.paid, settled: p.settled }])), today);
  });
  return { ok: true };
}

/** A pessoa já lançou alguma compra (de qualquer época)? */
export function hasExpenses(db: Db, userId: number): boolean {
  return !!db.select({ id: cardExpenses.id }).from(cardExpenses).where(eq(cardExpenses.userId, userId)).limit(1).get();
}

export function deleteExpense(db: Db, userId: number, id: number): Result {
  if (!ownsExpense(db, userId, id)) return NOT_FOUND;
  db.transaction((tx) => {
    // Sem a compra, os descontos das parcelas pagas dela são estornados (o saldo volta).
    deleteMovementsOfSource(tx as unknown as Db, installmentSource(id, 0).source);
    tx.delete(cardExpenses).where(eq(cardExpenses.id, id)).run();
  });
  return { ok: true };
}

function installmentOf(db: Db, userId: number, installmentId: number) {
  return (
    db
      .select({
        id: cardInstallments.id,
        expenseId: cardInstallments.expenseId,
        number: cardInstallments.number,
        amountCents: cardInstallments.amountCents,
        paid: cardInstallments.paid,
        settled: cardInstallments.settled,
        accountId: cardExpenses.accountId,
      })
      .from(cardInstallments)
      .innerJoin(cardExpenses, eq(cardExpenses.id, cardInstallments.expenseId))
      .where(and(eq(cardInstallments.id, installmentId), eq(cardExpenses.userId, userId)))
      .get() ?? null
  );
}

type Inst = NonNullable<ReturnType<typeof installmentOf>>;

/** Paga: desconta a parcela da conta da fatura (uma vez só). Desmarcar estorna. Tira "quitada". */
function applyPaid(db: Db, userId: number, row: Inst, paid: boolean, today: string): void {
  const src = installmentSource(row.expenseId, row.number);
  db.update(cardInstallments).set({ paid, ...(paid ? { settled: false } : {}) }).where(eq(cardInstallments.id, row.id)).run();
  if (paid && !row.paid) {
    const acc = row.accountId ? fiatAccountForCard(db, userId, row.accountId) : null;
    if (acc) upsertMovement(db, userId, src, { accountId: acc, date: today, amountCents: -row.amountCents });
  } else if (!paid) deleteMovement(db, src);
}

/** Quitada: encerra sem mexer em saldo. Se estava paga, deixa de estar (estorna o desconto). */
function applySettled(db: Db, row: Inst, settled: boolean): void {
  db.update(cardInstallments).set({ settled, ...(settled ? { paid: false } : {}) }).where(eq(cardInstallments.id, row.id)).run();
  if (settled) deleteMovement(db, installmentSource(row.expenseId, row.number));
}

export function setInstallmentPaid(db: Db, userId: number, installmentId: number, paid: boolean, today = new Date().toISOString().slice(0, 10)): Result {
  const row = installmentOf(db, userId, installmentId);
  if (!row) return NOT_FOUND;
  db.transaction((tx) => applyPaid(tx as unknown as Db, userId, row, paid, today));
  return { ok: true };
}

export function setInstallmentSettled(db: Db, userId: number, installmentId: number, settled: boolean): Result {
  const row = installmentOf(db, userId, installmentId);
  if (!row) return NOT_FOUND;
  db.transaction((tx) => applySettled(tx as unknown as Db, row, settled));
  return { ok: true };
}

export type MonthClosePreview = {
  month: string;
  count: number;
  totalCents: number;
  /** Contas que seriam descontadas (só em "pagar"); parcelas sem conta não descontam. */
  accounts: { name: string; cents: number }[];
  withoutAccount: number;
};

/** Parcelas do mês ainda em aberto (nem pagas nem quitadas): as únicas que o fechamento altera. */
function openOfMonth(db: Db, userId: number, month: string) {
  return db
    .select({
      id: cardInstallments.id,
      expenseId: cardInstallments.expenseId,
      number: cardInstallments.number,
      amountCents: cardInstallments.amountCents,
      paid: cardInstallments.paid,
      settled: cardInstallments.settled,
      accountId: cardExpenses.accountId,
      accountName: cardAccounts.name,
    })
    .from(cardInstallments)
    .innerJoin(cardExpenses, eq(cardExpenses.id, cardInstallments.expenseId))
    .leftJoin(cardAccounts, eq(cardAccounts.id, cardExpenses.accountId))
    .where(and(eq(cardExpenses.userId, userId), eq(cardInstallments.invoiceMonth, month), eq(cardInstallments.paid, false), eq(cardInstallments.settled, false)))
    .all();
}

/** Resumo para a confirmação do fechamento mensal. */
export function previewMonthClose(db: Db, userId: number, month: string): MonthClosePreview {
  const rows = openOfMonth(db, userId, month);
  const byAccount = new Map<string, number>();
  let withoutAccount = 0;
  for (const r of rows) {
    if (!r.accountId || !r.accountName) withoutAccount++;
    else byAccount.set(r.accountName, (byAccount.get(r.accountName) ?? 0) + r.amountCents);
  }
  return {
    month,
    count: rows.length,
    totalCents: rows.reduce((s, r) => s + r.amountCents, 0),
    accounts: [...byAccount].map(([name, cents]) => ({ name, cents })),
    withoutAccount,
  };
}

/**
 * Fechamento do mês: todas as parcelas em aberto do mês viram pagas (descontando cada uma da conta da sua fatura)
 * ou quitadas (sem mexer em saldo). Parcelas já pagas ou quitadas, e outros meses, não mudam.
 */
export function closeMonth(db: Db, userId: number, month: string, mode: "paid" | "settled", today = new Date().toISOString().slice(0, 10)): Result & { count?: number } {
  const rows = openOfMonth(db, userId, month);
  db.transaction((tx) => {
    for (const r of rows) {
      if (mode === "paid") applyPaid(tx as unknown as Db, userId, r, true, today);
      else applySettled(tx as unknown as Db, r, true);
    }
  });
  return { ok: true, count: rows.length };
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

export const NO_ACCOUNT = "Sem conta";

/**
 * Parcelas da pessoa com fatura entre os meses indicados (inclusive), com os dados da compra.
 * Compra sem conta (não deveria existir) continua aparecendo, como "Sem conta" (id 0).
 */
export function listInstallments(
  db: Db,
  userId: number,
  fromMonth: string,
  toMonth: string,
  opts: { unpaidOnly?: boolean } = {},
): InstallmentRow[] {
  const rows = db
    .select({
      installmentId: cardInstallments.id,
      expenseId: cardExpenses.id,
      number: cardInstallments.number,
      installments: cardExpenses.installments,
      invoiceMonth: cardInstallments.invoiceMonth,
      amountCents: cardInstallments.amountCents,
      paid: cardInstallments.paid,
      settled: cardInstallments.settled,
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
      amountMode: cardExpenses.amountMode,
    })
    .from(cardInstallments)
    .innerJoin(cardExpenses, eq(cardExpenses.id, cardInstallments.expenseId))
    .leftJoin(cardAccounts, eq(cardAccounts.id, cardExpenses.accountId))
    .leftJoin(cardCategories, eq(cardCategories.id, cardExpenses.categoryId))
    .where(
      and(
        eq(cardExpenses.userId, userId),
        between(cardInstallments.invoiceMonth, fromMonth, toMonth),
        // Em aberto = nem paga nem quitada.
        opts.unpaidOnly ? and(eq(cardInstallments.paid, false), eq(cardInstallments.settled, false)) : undefined,
      ),
    )
    .orderBy(asc(cardInstallments.invoiceMonth), asc(cardExpenses.description), asc(cardInstallments.number))
    .all();
  return rows.map((r) => ({ ...r, accountId: r.accountId ?? 0, accountName: r.accountName ?? NO_ACCOUNT })) as InstallmentRow[];
}

/** Quantas compras e parcelas a pessoa tem registradas (todas as épocas, pagas ou não, PF e PJ). */
export function countAllExpenses(db: Db, userId: number): { expenses: number; installments: number } {
  const e = db.select({ n: count() }).from(cardExpenses).where(eq(cardExpenses.userId, userId)).get();
  const i = db
    .select({ n: count() })
    .from(cardInstallments)
    .innerJoin(cardExpenses, eq(cardExpenses.id, cardInstallments.expenseId))
    .where(eq(cardExpenses.userId, userId))
    .get();
  return { expenses: e?.n ?? 0, installments: i?.n ?? 0 };
}

/**
 * Exclui TODAS as faturas (compras e parcelas) da pessoa, numa transação: ou tudo, ou nada. Mesma regra da
 * exclusão individual: os descontos que as parcelas pagas fizeram nas contas do R$ são estornados (só as
 * movimentações de parcela "inst:*" desta pessoa). Cartões, categorias, transações e contas ficam intactos.
 */
export function deleteAllExpenses(db: Db, userId: number): { ok: true; expenses: number; installments: number } {
  return db.transaction((tx) => {
    const t = tx as unknown as Db;
    const counts = countAllExpenses(t, userId);
    const ids = t.select({ id: cardExpenses.id }).from(cardExpenses).where(eq(cardExpenses.userId, userId)).all();
    for (const { id } of ids) deleteMovementsOfSource(t, installmentSource(id, 0).source);
    if (ids.length) {
      t.delete(cardInstallments).where(inArray(cardInstallments.expenseId, ids.map((r) => r.id))).run();
      t.delete(cardExpenses).where(eq(cardExpenses.userId, userId)).run();
    }
    return { ok: true as const, ...counts };
  });
}
