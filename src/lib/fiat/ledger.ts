// Saldo das contas do R$ com as movimentações do app (função pura, testada sem banco).
//
// Regra: o saldo informado pela pessoa ("saldo do dia") é a referência; as movimentações geradas pelo app
// (transação com conta, parcela paga) somam/subtraem a partir dele. Um saldo informado DEPOIS de uma
// movimentação já a inclui (reconcilia), então ela não conta de novo. Ordem: data e, no mesmo dia, o momento
// do registro. Sem nenhum saldo informado, a conta começa em zero.
import type { BalancePoint } from "./accounts";

export type Snapshot = { date: string; amount: string; createdAt: number };
export type Movement = { date: string; amountCents: number; createdAt: number };

const cents = (amount: string) => Math.round(Number(amount) * 100);
const fmt = (c: number) => (c / 100).toFixed(2);

/** Série de saldos (um ponto por data com registro ou movimentação), já com as movimentações. */
export function applyMovements(snapshots: Snapshot[], movements: Movement[]): BalancePoint[] {
  if (!movements.length) return snapshots.map((s) => ({ date: s.date, amount: s.amount }));
  type Ev = { date: string; at: number; kind: 0 | 1; v: number };
  const events: Ev[] = [
    ...snapshots.map((s): Ev => ({ date: s.date, at: s.createdAt, kind: 0, v: cents(s.amount) })),
    ...movements.map((m): Ev => ({ date: m.date, at: m.createdAt, kind: 1, v: m.amountCents })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.at - b.at));
  const out: BalancePoint[] = [];
  let value = 0;
  for (const e of events) {
    value = e.kind === 0 ? e.v : value + e.v;
    const last = out.at(-1);
    if (last && last.date === e.date) last.amount = fmt(value);
    else out.push({ date: e.date, amount: fmt(value) });
  }
  return out;
}
