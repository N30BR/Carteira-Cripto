// Movimentações das contas do R$ geradas pelo app (servidor): transações com conta e parcelas pagas.
// Cada origem gera no máximo uma movimentação (índice único em source + sourceId): repetir a mesma operação
// atualiza a existente, nunca desconta duas vezes. Desfazer (excluir transação, desmarcar "paga") apaga a
// movimentação, e o saldo volta sozinho (ele é calculado a partir delas).
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { accountMovements, cardAccounts, fiatAccounts } from "@/db/schema";

export type Source = { source: string; sourceId: number };
/** Transação. */
export const txSource = (id: number): Source => ({ source: "tx", sourceId: id });
/** Parcela: compra + número (estáveis; as linhas das parcelas são recriadas ao editar a compra). */
export const installmentSource = (expenseId: number, number: number): Source => ({ source: `inst:${expenseId}`, sourceId: number });

export function ownsFiatAccount(db: Db, userId: number, accountId: number): boolean {
  return !!db
    .select({ id: fiatAccounts.id })
    .from(fiatAccounts)
    .where(and(eq(fiatAccounts.id, accountId), eq(fiatAccounts.userId, userId)))
    .get();
}

/** Cria ou atualiza a movimentação da origem. `keepDate`: mantém a data já registrada (ex.: parcela já paga). */
export function upsertMovement(
  db: Db,
  userId: number,
  src: Source,
  m: { accountId: number; date: string; amountCents: number },
  opts: { keepDate?: boolean } = {},
): void {
  const existing = getMovement(db, src);
  if (existing) {
    db.update(accountMovements)
      .set({ accountId: m.accountId, amountCents: m.amountCents, ...(opts.keepDate ? {} : { date: m.date }) })
      .where(eq(accountMovements.id, existing.id))
      .run();
    return;
  }
  db.insert(accountMovements)
    .values({ userId, accountId: m.accountId, date: m.date, amountCents: m.amountCents, ...src, createdAt: new Date() })
    .run();
}

export function getMovement(db: Db, src: Source) {
  return (
    db
      .select()
      .from(accountMovements)
      .where(and(eq(accountMovements.source, src.source), eq(accountMovements.sourceId, src.sourceId)))
      .get() ?? null
  );
}

export function deleteMovement(db: Db, src: Source): void {
  db.delete(accountMovements)
    .where(and(eq(accountMovements.source, src.source), eq(accountMovements.sourceId, src.sourceId)))
    .run();
}

/** Todas as movimentações de uma origem (ex.: todas as parcelas de uma compra excluída). */
export function deleteMovementsOfSource(db: Db, source: string): void {
  db.delete(accountMovements).where(eq(accountMovements.source, source)).run();
}

/** Parcelas que já geraram desconto numa conta ("compra:número"): o saldo do R$ já as inclui. */
export function debitedInstallments(db: Db, userId: number): Set<string> {
  const rows = db
    .select({ source: accountMovements.source, sourceId: accountMovements.sourceId })
    .from(accountMovements)
    .where(eq(accountMovements.userId, userId))
    .all();
  return new Set(rows.filter((r) => r.source.startsWith("inst:")).map((r) => `${r.source.slice(5)}:${r.sourceId}`));
}

/** Movimentações da pessoa por conta (para o saldo). */
export function listMovements(db: Db, userId: number): Record<number, { date: string; amountCents: number; createdAt: number }[]> {
  const rows = db
    .select({ accountId: accountMovements.accountId, date: accountMovements.date, amountCents: accountMovements.amountCents, createdAt: accountMovements.createdAt })
    .from(accountMovements)
    .where(eq(accountMovements.userId, userId))
    .all();
  const out: Record<number, { date: string; amountCents: number; createdAt: number }[]> = {};
  for (const r of rows) (out[r.accountId] ??= []).push({ date: r.date, amountCents: r.amountCents, createdAt: r.createdAt.getTime() });
  return out;
}

/**
 * Conta do R$ de um cartão das Faturas (a mesma conta, compartilhada): a já ligada; senão a do R$ com o mesmo
 * nome; senão cria no R$ com esse nome (sem saldo informado: começa em zero). Guarda a ligação.
 */
export function fiatAccountForCard(db: Db, userId: number, cardAccountId: number): number | null {
  const card = db
    .select({ id: cardAccounts.id, name: cardAccounts.name, fiatAccountId: cardAccounts.fiatAccountId })
    .from(cardAccounts)
    .where(and(eq(cardAccounts.id, cardAccountId), eq(cardAccounts.userId, userId)))
    .get();
  if (!card) return null;
  if (card.fiatAccountId && ownsFiatAccount(db, userId, card.fiatAccountId)) return card.fiatAccountId;
  let fiat = db
    .select({ id: fiatAccounts.id })
    .from(fiatAccounts)
    .where(and(eq(fiatAccounts.userId, userId), eq(fiatAccounts.name, card.name)))
    .get();
  if (!fiat) [fiat] = db.insert(fiatAccounts).values({ userId, name: card.name, createdAt: new Date() }).returning({ id: fiatAccounts.id }).all();
  db.update(cardAccounts).set({ fiatAccountId: fiat.id }).where(eq(cardAccounts.id, card.id)).run();
  return fiat.id;
}
