"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, type RefCurrency } from "@/lib/currency";
import { formatPct } from "@/lib/format";
import { monthShort } from "@/lib/cards/months";
import { DOWN, UP } from "@/components/dashboard/palette";

const brl = (cents: number) => formatMoney(cents / 100, "BRL");
const MINOR: Record<RefCurrency, number> = { BRL: 100, USDT: 100, BTC: 100_000_000 };
const money = (minor: number, cur: RefCurrency) => formatMoney(minor / MINOR[cur], cur);
const NEUTRAL = "#60A5FA";
// Eixo: "2 mil" em reais/dólares; em BTC (valores pequenos), 3 algarismos significativos.
const axis = (minor: number, cur: RefCurrency) => {
  const n = minor / MINOR[cur];
  return cur === "BTC" ? n.toLocaleString("pt-BR", { maximumSignificantDigits: 3 }) : compact.format(n);
};
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--popover-foreground)",
};
const axisTick = { fill: "var(--muted-foreground)", fontSize: 12 };

function Empty({ text }: { text: string }) {
  return <div className="grid h-56 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">{text}</div>;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="size-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

/** Entradas (verde) e saídas (vermelho) lado a lado, um par por mês. */
export function TransactionBars({
  data,
  currency = "BRL",
}: {
  data: { month: string; inflow: number; outflow: number }[];
  /** Moeda dos valores (em unidades mínimas: centavos, satoshis). */
  currency?: RefCurrency;
}) {
  const rows = data.map((d) => ({ ...d, label: monthShort(d.month).slice(0, 3) }));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end gap-4">
        <LegendDot color={UP} label="Entradas" />
        <LegendDot color={DOWN} label="Saídas" />
      </div>
      <div className="h-64 w-full" data-testid="tx-bars">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barGap={4} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
            <YAxis tickLine={false} axisLine={false} width={56} tick={axisTick} tickFormatter={(v: number) => axis(v, currency)} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.4 }}
              contentStyle={tooltipStyle}
              labelFormatter={(_, p) => (p?.[0] ? monthShort((p[0].payload as { month: string }).month) : "")}
              formatter={(v, name) => [money(Number(v), currency), String(name)]}
            />
            <Bar dataKey="inflow" name="Entradas" fill={UP} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="outflow" name="Saídas" fill={DOWN} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type Slice = { name: string; cents: number; share: number; color: string };

/** Pizza com o percentual escrito dentro das fatias e legenda à direita (nome e %). */
function PieLegend({
  slices,
  empty,
  labelInside,
  format = brl,
}: {
  slices: Slice[];
  empty: string;
  labelInside?: boolean;
  format?: (v: number) => string;
}) {
  const data = slices.filter((s) => s.cents > 0);
  if (!data.length) return <Empty text={empty} />;
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="size-52 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="cents" nameKey="name" outerRadius="100%" stroke="var(--card)" strokeWidth={2} isAnimationActive={false}>
              {data.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
              {labelInside && (
                <LabelList
                  dataKey="share"
                  position="inside"
                  formatter={(v) => (Number(v) >= 0.05 ? formatPct(Number(v)) : "")}
                  style={{ fill: "#fff", fontWeight: 700, fontSize: 13 }}
                />
              )}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              itemStyle={{ color: "var(--popover-foreground)" }}
              formatter={(v, name, item) => [`${format(Number(v))} (${formatPct((item.payload as Slice).share)})`, String(name)]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex w-full flex-col gap-2.5 text-sm">
        {slices.map((s) => (
          <li key={s.name} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2">
            <span className="size-3 rounded-sm" style={{ background: s.color }} />
            <span className="min-w-0 truncate" title={s.name}>
              {s.name}
            </span>
            <span className="font-semibold tabular-nums">{s.cents > 0 ? formatPct(s.share) : "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Participação de entradas e saídas sobre entradas + saídas. */
export function TransactionPie({
  inflow,
  outflow,
  shares,
  currency = "BRL",
}: {
  inflow: number;
  outflow: number;
  shares: { inflow: number | null; outflow: number | null };
  currency?: RefCurrency;
}) {
  return (
    <PieLegend
      labelInside
      format={(v) => money(v, currency)}
      empty="Sem movimentações no período"
      slices={[
        { name: "Entradas", cents: inflow, share: shares.inflow ?? 0, color: UP },
        { name: "Saídas", cents: outflow, share: shares.outflow ?? 0, color: DOWN },
      ]}
    />
  );
}

export type ComponentDatum = {
  key: string;
  label: string;
  short: string;
  signedCents: number | null;
  share: number | null;
  tone: "neutral" | "in" | "out" | "info";
};

// Saldos em tons de azul (neutros), entradas em verdes e saídas em vermelhos, para separar os componentes.
const BLUES = [NEUTRAL, "#93c5fd", "#1d4ed8"];
const GREENS = ["#16a34a", "#86efac", "#2dd4bf"];
const REDS = ["#ef4444", "#fda4af", "#f97316"];

function componentColors(items: ComponentDatum[]): Record<string, string> {
  const next = { neutral: 0, in: 0, out: 0 };
  const palette = { neutral: BLUES, in: GREENS, out: REDS };
  return Object.fromEntries(
    items.map((c) => {
      const tone = c.tone === "info" ? ((c.signedCents ?? 0) < 0 ? "out" : "in") : c.tone;
      return [c.key, palette[tone][next[tone]++ % palette[tone].length]];
    }),
  );
}
// Saldos em azul; a variação (informativa) em verde ou vermelho conforme o sinal.
const barColor = (c: ComponentDatum) =>
  c.tone === "neutral" ? NEUTRAL : c.tone === "out" || (c.tone === "info" && (c.signedCents ?? 0) < 0) ? DOWN : UP;

/** Uma barra por componente com a magnitude; a cor diz se é saldo (azul), soma (verde) ou subtrai (vermelho). */
export function ComponentBars({ items, currency = "BRL" }: { items: ComponentDatum[]; currency?: RefCurrency }) {
  const data = items.map((c) => ({ ...c, abs: Math.abs(c.signedCents ?? 0) }));
  if (!data.some((d) => d.abs > 0)) return <Empty text="Sem valores para comparar" />;
  return (
    <div className="h-64 w-full" data-testid="summary-bars">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 24, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
          <XAxis dataKey="short" tickLine={false} axisLine={false} tick={axisTick} />
          <YAxis tickLine={false} axisLine={false} width={56} tick={axisTick} tickFormatter={(v: number) => axis(v, currency)} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            contentStyle={tooltipStyle}
            formatter={(_, __, item) => {
              const d = item.payload as ComponentDatum;
              const v = d.signedCents ?? 0;
              const sign = v < 0 ? "- " : d.tone === "neutral" && d.key !== "variation" ? "" : "+ ";
              return [`${sign}${money(Math.abs(v), currency)}`, d.label];
            }}
            labelFormatter={() => ""}
          />
          <Bar dataKey="abs" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.key} fill={barColor(d)} />
            ))}
            <LabelList
              dataKey="abs"
              position="top"
              content={({ x, y, width, value }) => (
                <text
                  x={Number(x) + Number(width) / 2}
                  y={Number(y) - 6}
                  textAnchor="middle"
                  style={{ fill: "var(--foreground)", fontSize: 11, fontWeight: 600 }}
                >
                  {money(Number(value), currency)}
                </text>
              )}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Participação de cada componente contabilizado sobre a soma dos valores absolutos (não é o saldo líquido).
 * A variação cripto (informativa) fica de fora.
 */
export function ComponentPie({ items, currency = "BRL" }: { items: ComponentDatum[]; currency?: RefCurrency }) {
  const counted = items.filter((c) => c.tone !== "info");
  const colors = componentColors(counted);
  const sorted = [...counted].sort((a, b) => (b.share ?? 0) - (a.share ?? 0));
  return (
    <PieLegend
      labelInside
      empty="Sem valores para distribuir"
      format={(v) => money(v, currency)}
      slices={sorted.map((c) => ({ name: c.label, cents: Math.abs(c.signedCents ?? 0), share: c.share ?? 0, color: colors[c.key] }))}
    />
  );
}
