"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { HIDDEN, useDiscreet } from "@/components/discreet-store";
import { formatMoney, type RefCurrency } from "@/lib/currency";
import { ACCENT } from "./palette";

const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const monthYear = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" });
const tipFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const compactBtc = new Intl.NumberFormat("pt-BR", { maximumSignificantDigits: 3 });
const PREFIX: Record<RefCurrency, string> = { USDT: "US$", BRL: "R$", BTC: "₿" };
const DAY = 86_400_000;

export function CapitalChart({
  points,
  currency,
  missingHistory = [],
  emptyText = "Preços indisponíveis",
}: {
  points: { t: number; value: number }[];
  currency: RefCurrency;
  missingHistory?: string[];
  emptyText?: string;
}) {
  const discreet = useDiscreet();
  if (points.length < 2) {
    return (
      <div className="grid h-64 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }
  // Períodos até 2 meses: dia/mês; mais longos: mês/ano.
  const span = points[points.length - 1].t - points[0].t;
  const axisFmt = span <= 62 * DAY ? shortDate : monthYear;
  const axisValue = (v: number) => `${PREFIX[currency]} ${(currency === "BTC" ? compactBtc : compact).format(v)}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="h-64 w-full" data-testid="capital-chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="capitalFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(t: number) => axisFmt.format(t)}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              dataKey="value"
              orientation="right"
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => (discreet ? "" : axisValue(v))}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={88}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--popover-foreground)",
              }}
              labelFormatter={(t) => tipFmt.format(Number(t))}
              formatter={(v) => [discreet ? HIDDEN : formatMoney(Number(v), currency), "Saldo"]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={ACCENT}
              strokeWidth={2}
              fill="url(#capitalFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {missingHistory.length > 0 && (
        <p className="text-xs text-muted-foreground">Sem histórico: {missingHistory.join(", ")}</p>
      )}
    </div>
  );
}
