// Cálculos das transações (funções puras). Valores em centavos, sempre positivos; o sinal vem do tipo.

export type TxKind = "in" | "out";
export type TxLike = { date: string; kind: TxKind; amountCents: number };

export type TxTotals = { inflow: number; outflow: number; balance: number; countIn: number; countOut: number };

/** Entradas, saídas (magnitude positiva), saldo = entradas − saídas, e quantas de cada. */
export function transactionTotals(list: TxLike[]): TxTotals {
  const t: TxTotals = { inflow: 0, outflow: 0, balance: 0, countIn: 0, countOut: 0 };
  for (const x of list) {
    if (x.kind === "in") {
      t.inflow += x.amountCents;
      t.countIn++;
    } else {
      t.outflow += x.amountCents;
      t.countOut++;
    }
  }
  t.balance = t.inflow - t.outflow;
  return t;
}

/** Participação de cada tipo sobre entradas + saídas (valores absolutos); null sem movimento. */
export function transactionShares(t: Pick<TxTotals, "inflow" | "outflow">): { inflow: number | null; outflow: number | null } {
  const base = t.inflow + t.outflow;
  if (base <= 0) return { inflow: null, outflow: null };
  return { inflow: t.inflow / base, outflow: t.outflow / base };
}

/** Entradas e saídas por mês ("AAAA-MM"), um ponto por mês pedido. */
export function monthlyTransactions(list: TxLike[], months: string[]): { month: string; inflow: number; outflow: number }[] {
  return months.map((month) => {
    const t = transactionTotals(list.filter((x) => x.date.slice(0, 7) === month));
    return { month, inflow: t.inflow, outflow: t.outflow };
  });
}
