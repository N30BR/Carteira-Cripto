"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatMoney, type RefCurrency } from "@/lib/currency";
import { formatPct } from "@/lib/format";
import { CATEGORICAL, OTHERS, coinColor } from "./palette";

type Slice = { symbol: string; value: number; share: number };

/** Mostra as maiores fatias e junta o resto em "Outros". */
function toSlices(rows: Slice[]): (Slice & { color: string })[] {
  const top = rows.slice(0, CATEGORICAL.length);
  const rest = rows.slice(CATEGORICAL.length);
  // Cor oficial do token, se houver; senão, a próxima da paleta que ainda não foi usada.
  const used = new Set(top.map((r) => coinColor(r.symbol)).filter(Boolean));
  const free = CATEGORICAL.filter((c) => !used.has(c));
  let next = 0;
  const out = top.map((r) => ({ ...r, color: coinColor(r.symbol) ?? free[next++ % free.length] }));
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

export function AllocationDonut({ rows, currency, emptyText = "Preços indisponíveis" }: { rows: Slice[]; currency: RefCurrency; emptyText?: string }) {
  const slices = toSlices(rows);
  if (!slices.length) {
    return (
      <div className="grid h-56 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-8 sm:flex-row">
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
              stroke="var(--border)"
              strokeWidth={1}
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
              formatter={(v, name) => [formatMoney(Number(v), currency), String(name)]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid w-full max-w-2xl grid-cols-1 gap-x-10 gap-y-2 text-sm sm:grid-cols-2" aria-label="Distribuição por ativo">
        {slices.map((s) => (
          <li key={s.symbol} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full ring-1 ring-border" style={{ background: s.color }} />
            <span className="font-medium">{s.symbol}</span>
            <span className="ml-auto tabular-nums text-muted-foreground">{formatPct(s.share)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
