"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatPct, formatUsd } from "@/lib/format";
import { CATEGORICAL, OTHERS } from "./palette";

type Slice = { symbol: string; value: number; share: number };

/** Mostra as maiores fatias e junta o resto em "Outros". */
function toSlices(rows: Slice[]): (Slice & { color: string })[] {
  const top = rows.slice(0, CATEGORICAL.length);
  const rest = rows.slice(CATEGORICAL.length);
  const out = top.map((r, i) => ({ ...r, color: CATEGORICAL[i] }));
  if (rest.length) {
    out.push({
      symbol: "Outros",
      value: rest.reduce((s, r) => s + r.value, 0),
      share: rest.reduce((s, r) => s + r.share, 0),
      color: OTHERS,
    });
  }
  return out;
}

export function AllocationDonut({ rows }: { rows: Slice[] }) {
  const slices = toSlices(rows);
  if (!slices.length) {
    return (
      <div className="grid h-56 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">
        Preços indisponíveis
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="size-48 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="symbol"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={slices.length > 1 ? 2 : 0}
              stroke="none"
              isAnimationActive={false}
            >
              {slices.map((s) => (
                <Cell key={s.symbol} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--popover-foreground)",
              }}
              itemStyle={{ color: "var(--popover-foreground)" }}
              formatter={(v, name) => [formatUsd(Number(v)), String(name)]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex w-full flex-col gap-2 text-sm" aria-label="Distribuição por ativo">
        {slices.map((s) => (
          <li key={s.symbol} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="font-medium">{s.symbol}</span>
            <span className="ml-auto tabular-nums text-muted-foreground">{formatPct(s.share)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
