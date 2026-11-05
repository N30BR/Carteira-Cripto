const usd = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 });
const small = new Intl.NumberFormat("pt-BR", { maximumSignificantDigits: 4 });

export function formatUsd(n: number): string {
  const s = `US$ ${usd.format(Math.abs(n))}`;
  return n < 0 ? `-${s}` : s;
}

export function formatPct(n: number): string {
  return `${pct.format(n * 100)}%`;
}

/** Preço unitário: moedas abaixo de US$ 1 ganham casas até 4 dígitos significativos (ex.: US$ 0,00001234). */
export function formatPrice(n: number): string {
  if (Math.abs(n) >= 1 || n === 0) return formatUsd(n);
  const [int, dec = ""] = small.format(Math.abs(n)).split(",");
  return `${n < 0 ? "-" : ""}US$ ${int},${dec.padEnd(2, "0")}`;
}

export function formatQty(q: string | number): string {
  const n = Number(q);
  const s = qty.format(n);
  // Quantidades positivas menores que 8 casas não podem aparecer como "0".
  return n > 0 && s === "0" ? "< 0,00000001" : s;
}

/** Valor para pré-preencher um campo de quantidade: sem agrupar milhar e sem arredondar. */
export function quantityToInput(q: string): string {
  return q.replace(".", ",");
}
