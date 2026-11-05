const usd = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 });

export function formatUsd(n: number): string {
  const s = `US$ ${usd.format(Math.abs(n))}`;
  return n < 0 ? `-${s}` : s;
}

export function formatPct(n: number): string {
  return `${pct.format(n * 100)}%`;
}

export function formatQty(q: string | number): string {
  return qty.format(Number(q));
}

/** Valor para pré-preencher um campo de quantidade: sem agrupar milhar e sem arredondar. */
export function quantityToInput(q: string): string {
  return q.replace(".", ",");
}
