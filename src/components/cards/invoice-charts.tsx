"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, type RefCurrency } from "@/lib/currency";
import { formatPct } from "@/lib/format";
import { monthShort } from "@/lib/cards/months";
import type { Side } from "@/lib/cards/store";
import { NO_CATEGORY } from "@/lib/cards/summary";
import { cn } from "@/lib/utils";
import { NATURE_COLOR, categoryColor } from "./colors";

// Valores em unidades mínimas da moeda (centavos; satoshis em BTC).
const MINOR: Record<RefCurrency, number> = { BRL: 100, USDT: 100, BTC: 100_000_000 };
const SYMBOL: Record<RefCurrency, string> = { BRL: "R$", USDT: "US$", BTC: "₿" };
const fmt = (minor: number, cur: RefCurrency) => formatMoney(minor / MINOR[cur], cur);
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

/** Barras mensais por conta (uma cor por conta), com seletor de conta. */
export function InvoiceBars({
  data,
  accounts,
  currency = "BRL",
}: {
  data: { month: string; byAccount: Record<number, number> }[];
  accounts: { id: number; name: string; color: string }[];
  currency?: RefCurrency;
}) {
  const [show, setShow] = useState<string>("ALL");
  const rows = data.map((d) => ({
    label: monthShort(d.month).slice(0, 3),
    month: d.month,
    ...Object.fromEntries(accounts.map((a) => [`a${a.id}`, d.byAccount[a.id] ?? 0])),
  }));
  const shown = show === "ALL" ? accounts : accounts.filter((a) => String(a.id) === show);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Segmented
          label="Cartões no gráfico"
          value={show}
          onChange={setShow}
          options={[{ value: "ALL", label: "Todos" }, ...accounts.map((a) => ({ value: String(a.id), label: a.name }))]}
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
              tickFormatter={(v: number) =>
                `${SYMBOL[currency]} ${currency === "BTC" ? (v / MINOR[currency]).toLocaleString("pt-BR", { maximumSignificantDigits: 3 }) : compact.format(v / MINOR[currency])}`
              }
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.4 }}
              contentStyle={tooltipStyle}
              labelFormatter={(_, p) => (p?.[0] ? monthShort((p[0].payload as { month: string }).month) : "")}
              formatter={(v, name) => [fmt(Number(v), currency), String(name)]}
            />
            <Legend />
            {shown.map((a) => (
              <Bar key={a.id} dataKey={`a${a.id}`} name={a.name} fill={a.color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type Slice = { name: string; cents: number; color: string };

function PieWithLegend({ slices, total, empty, currency }: { slices: Slice[]; total: number; empty: string; currency: RefCurrency }) {
  if (!slices.length || total <= 0) {
    return <div className="grid h-48 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">{empty}</div>;
  }
  return (
    <div className="flex flex-col items-center gap-4">
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
              formatter={(v, name) => [`${fmt(Number(v), currency)} (${formatPct(Number(v) / total)})`, String(name)]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex w-full flex-col gap-2 text-sm">
        {slices.map((s) => (
          <li key={s.name} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-2">
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="min-w-0 truncate" title={s.name}>
              {s.name}
            </span>
            <span className="tabular-nums whitespace-nowrap text-muted-foreground">{fmt(s.cents, currency)}</span>
            <span className="w-16 text-right font-semibold tabular-nums">{formatPct(s.cents / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Pizza por categoria do mês, com filtro PF/PJ; mostra as 7 maiores e junta o resto em "Outras". */
export function CategoryPie({
  items,
  currency = "BRL",
}: {
  items: { nature: Side; categoryId: number | null; category: string | null; cents: number }[];
  currency?: RefCurrency;
}) {
  const [nature, setNature] = useState<"ALL" | Side>("ALL");
  const sums = new Map<string, { cents: number; id: number | null }>();
  for (const i of items) {
    if (nature !== "ALL" && i.nature !== nature) continue;
    const name = i.category ?? NO_CATEGORY;
    const prev = sums.get(name);
    sums.set(name, { cents: (prev?.cents ?? 0) + i.cents, id: i.categoryId });
  }
  const sorted = [...sums.entries()].sort((a, b) => b[1].cents - a[1].cents);
  const top = sorted.slice(0, 7).map(([name, v]) => ({ name, cents: v.cents, color: categoryColor(v.id) }));
  const rest = sorted.slice(7).reduce((s, [, v]) => s + v.cents, 0);
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
      <PieWithLegend slices={slices} total={total} empty="Sem despesas no período" currency={currency} />
    </div>
  );
}

/** Pizza PF × PJ pela natureza da despesa (não pelo cartão). */
export function NaturePie({ pf, pj, currency = "BRL" }: { pf: number; pj: number; currency?: RefCurrency }) {
  const slices = [
    { name: "Pessoa Física (PF)", cents: pf, color: NATURE_COLOR.PF },
    { name: "Pessoa Jurídica (PJ)", cents: pj, color: NATURE_COLOR.PJ },
  ].filter((s) => s.cents > 0);
  return <PieWithLegend slices={slices} total={pf + pj} empty="Sem despesas no período" currency={currency} />;
}
