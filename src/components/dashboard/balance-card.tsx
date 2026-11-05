import { formatPct, formatUsd } from "@/lib/format";
import { DOWN, UP } from "./palette";

export function BalanceCard({
  total,
  change24hUsd,
  change24hPct,
}: {
  total: number;
  change24hUsd: number;
  change24hPct: number | null;
}) {
  const up = change24hUsd >= 0;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">Saldo total</span>
      <span className="text-4xl font-semibold tracking-tight tabular-nums" data-testid="total">
        {formatUsd(total)}
      </span>
      <span className="text-sm tabular-nums" style={{ color: change24hPct === null ? undefined : up ? UP : DOWN }}>
        {change24hPct === null ? (
          <span className="text-muted-foreground">— (24h)</span>
        ) : (
          <>
            {up ? "▲" : "▼"} {formatUsd(Math.abs(change24hUsd))} ({formatPct(Math.abs(change24hPct))}) · 24h
          </>
        )}
      </span>
    </div>
  );
}
