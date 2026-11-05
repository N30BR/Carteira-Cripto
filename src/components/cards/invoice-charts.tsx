"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/currency";
import { formatPct } from "@/lib/format";
import { monthShort } from "@/lib/cards/months";
import type { Side } from "@/lib/cards/store";
import { NO_CATEGORY } from "@/lib/cards/summary";
import { cn } from "@/lib/utils";
import { CARD_COLOR, NATURE_COLOR, categoryColor } from "./colors";

const brl = (cents: number) => formatMoney(cents / 100, "BRL");
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--popover-foreground)",
};

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("rounded-md px-2.5 py-1 text-muted-foreground", value === o.value && "bg-muted font-medium text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Barras mensais por cartão (verde = Cartão PF, roxo = Cartão PJ), com seletor de cartão. */
export function InvoiceBars({ data }: { data: { month: string; cardPF: number; cardPJ: number }[] }) {
  const [show, setShow] = useState<"ALL" | Side>("ALL");
  const rows = data.map((d) => ({ label: monthShort(d.month).slice(0, 3), month: d.month, PF: d.cardPF, PJ: d.cardPJ }));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Segmented
          label="Cartões no gráfico"
          value={show}
          onChange={setShow}
          options={[
            { value: "ALL", label: "Ambos" },
            { value: "PF", label: "Cartão PF" },
            { value: "PJ", label: "Cartão PJ" },
          ]}
        />
      </div>
      <div className="h-64 w-full" data-testid="invoice-bars">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barGap={4} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={64}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickFormatter={(v: number) => `R$ ${compact.format(v / 100)}`}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.4 }}
              contentStyle={tooltipStyle}
              labelFormatter={(_, p) => (p?.[0] ? monthShort((p[0].payload as { month: string }).month) : "")}
              formatter={(v, name) => [brl(Number(v)), `Cartão ${String(name)}`]}
            />
            <Legend formatter={(v) => `Cartão ${v}`} />
            {show !== "PJ" && <Bar dataKey="PF" fill={CARD_COLOR.PF} radius={[4, 4, 0, 0]} isAnimationActive={false} />}
            {show !== "PF" && <Bar dataKey="PJ" fill={CARD_COLOR.PJ} radius={[4, 4, 0, 0]} isAnimationActive={false} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type Slice = { name: string; cents: number; color: string };

function PieWithLegend({ slices, total, empty }: { slices: Slice[]; total: number; empty: string }) {
  if (!slices.length || total <= 0) {
    return <div className="grid h-48 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">{empty}</div>;
  }
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="size-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="cents" nameKey="name" outerRadius="100%" stroke="var(--card)" strokeWidth={2} isAnimationActive={false}>
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              itemStyle={{ color: "var(--popover-foreground)" }}
              formatter={(v, name) => [`${brl(Number(v))} (${formatPct(Number(v) / total)})`, String(name)]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex w-full flex-col gap-2 text-sm">
        {slices.map((s) => (
          <li key={s.name} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="truncate">{s.name}</span>
            <span className="ml-auto tabular-nums text-muted-foreground">{brl(s.cents)}</span>
            <span className="w-14 text-right font-semibold tabular-nums">{formatPct(s.cents / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Pizza por categoria do mês, com filtro PF/PJ; mostra as 7 maiores e junta o resto em "Outras". */
export function CategoryPie({ items }: { items: { nature: Side; category: string | null; cents: number }[] }) {
  const [nature, setNature] = useState<"ALL" | Side>("ALL");
  const sums = new Map<string, number>();
  for (const i of items) {
    if (nature !== "ALL" && i.nature !== nature) continue;
    const name = i.category ?? NO_CATEGORY;
    sums.set(name, (sums.get(name) ?? 0) + i.cents);
  }
  const sorted = [...sums.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 7).map(([name, cents]) => ({ name, cents, color: categoryColor(name) }));
  const rest = sorted.slice(7).reduce((s, [, c]) => s + c, 0);
  const slices = rest > 0 ? [...top, { name: "Outras", cents: rest, color: "#64748B" }] : top;
  const total = slices.reduce((s, x) => s + x.cents, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Segmented
          label="Natureza das despesas"
          value={nature}
          onChange={setNature}
          options={[
            { value: "ALL", label: "Todos" },
            { value: "PF", label: "PF" },
            { value: "PJ", label: "PJ" },
          ]}
        />
      </div>
      <PieWithLegend slices={slices} total={total} empty="Sem despesas no mês" />
    </div>
  );
}

/** Pizza PF × PJ pela natureza da despesa (não pelo cartão). */
export function NaturePie({ pf, pj }: { pf: number; pj: number }) {
  const slices = [
    { name: "Pessoa Física (PF)", cents: pf, color: NATURE_COLOR.PF },
    { name: "Pessoa Jurídica (PJ)", cents: pj, color: NATURE_COLOR.PJ },
  ].filter((s) => s.cents > 0);
  return <PieWithLegend slices={slices} total={pf + pj} empty="Sem despesas no mês" />;
}
