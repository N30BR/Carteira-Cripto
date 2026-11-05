import { formatMoney, type RefCurrency } from "@/lib/currency";
import { formatPct } from "@/lib/format";
import { DOWN, UP } from "./palette";

export function BalanceCard({
  total,
  changeAbs,
  changePct,
  changeLabel,
  currency,
}: {
  total: number | null;
  changeAbs: number;
  changePct: number | null;
  /** Ex.: "24h" ou "no mês". */
  changeLabel: string;
  currency: RefCurrency;
}) {
  const up = changeAbs >= 0;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">Saldo total</span>
      <span className="text-4xl font-semibold tracking-tight tabular-nums" data-testid="total">
        {total === null ? "—" : formatMoney(total, currency)}
      </span>
      <span className="text-sm tabular-nums" style={{ color: changePct === null ? undefined : up ? UP : DOWN }}>
        {changePct === null ? (
          <span className="text-muted-foreground">— ({changeLabel})</span>
        ) : (
          <>
            {up ? "▲" : "▼"} {formatMoney(Math.abs(changeAbs), currency)} ({formatPct(Math.abs(changePct) / 100)}) ·{" "}
            {changeLabel}
          </>
        )}
      </span>
    </div>
  );
}
