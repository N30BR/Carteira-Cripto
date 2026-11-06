import { formatMoney, type RefCurrency } from "@/lib/currency";
import { formatPct } from "@/lib/format";
import { Priv } from "@/components/priv";
import { DOWN, UP } from "./palette";

export type BalanceChange = { label: string; abs: number; pct: number | null };

function ChangeLine({ c, currency }: { c: BalanceChange; currency: RefCurrency }) {
  if (c.pct === null) return <span className="text-muted-foreground">{c.label} —</span>;
  const up = c.abs >= 0;
  return (
    <span style={{ color: up ? UP : DOWN }}>
      <span className="text-muted-foreground">{c.label}</span>{" "}
      {up ? "▲" : "▼"} <Priv>{formatMoney(Math.abs(c.abs), currency)}</Priv> ({formatPct(Math.abs(c.pct) / 100)})
    </span>
  );
}

export function BalanceCard({
  total,
  changes,
  currency,
}: {
  total: number | null;
  /** Variações mostradas abaixo do saldo, ex.: 1D, 3M, 6M (Cripto) ou "no mês" (R$). */
  changes: BalanceChange[];
  currency: RefCurrency;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">Saldo total</span>
      <span className="text-4xl font-semibold tracking-tight tabular-nums" data-testid="total">
        {total === null ? "—" : <Priv dots>{formatMoney(total, currency)}</Priv>}
      </span>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums" data-testid="total-changes">
        {changes.map((c) => (
          <ChangeLine key={c.label} c={c} currency={currency} />
        ))}
      </div>
    </div>
  );
}
