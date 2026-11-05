// Peças visuais comuns de Lançamentos, Faturas, Transações e Resumo (tema escuro do app).
import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp, Scale } from "lucide-react";
import { formatMoney, type RefCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { DOWN, UP } from "@/components/dashboard/palette";

export const BLUE = "#4C66DD";
/** Saldos patrimoniais no Resumo: nem entrada nem saída. */
export const NEUTRAL = "#60A5FA";
export { DOWN, UP };

/** Cores das contas de cartão (até 4). */
export const ACCOUNT_COLORS = ["#28A38C", "#9470E7", "#F59E0B", "#38BDF8"];

/**
 * Cor de cada conta pelo id (não pela posição): excluir uma conta não muda a cor das outras.
 * Se duas contas caírem na mesma cor, a de id maior pega a próxima livre.
 */
export function accountColors(accounts: { id: number }[]): Record<number, string> {
  const used = new Set<number>();
  const out: Record<number, string> = {};
  for (const a of [...accounts].sort((x, y) => x.id - y.id)) {
    let i = (((a.id - 1) % 4) + 4) % 4;
    for (let n = 0; n < 4 && used.has(i); n++) i = (i + 1) % 4;
    used.add(i);
    out[a.id] = ACCOUNT_COLORS[i];
  }
  return out;
}

export const brl = (cents: number) => formatMoney(cents / 100, "BRL");

/** Unidades mínimas por moeda: centavos (BRL, USDT) e satoshis (BTC). */
export const MINOR: Record<RefCurrency, number> = { BRL: 100, USDT: 100, BTC: 100_000_000 };
/** Formata um valor em unidades mínimas da moeda. */
export const money = (minor: number, currency: RefCurrency = "BRL") => formatMoney(minor / MINOR[currency], currency);

/** "2025-05-10" → "10/05/2025" */
export const dateBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * Valor com sinal: verde e "+" se positivo, vermelho e "-" se negativo, sem cor se zero.
 * `neutral`: saldo patrimonial, na cor neutra e sem "+". `cents` em unidades mínimas de `currency`.
 */
export function SignedMoney({
  cents,
  className,
  testId,
  currency = "BRL",
  neutral,
}: {
  cents: number;
  className?: string;
  testId?: string;
  currency?: RefCurrency;
  neutral?: boolean;
}) {
  if (cents === 0 || neutral) {
    return (
      <span
        className={cn("whitespace-nowrap tabular-nums", neutral && "font-semibold", className)}
        style={neutral ? { color: NEUTRAL } : undefined}
        data-testid={testId}
      >
        {cents < 0 ? "- " : ""}
        {money(Math.abs(cents), currency)}
      </span>
    );
  }
  const up = cents > 0;
  return (
    <span className={cn("font-semibold whitespace-nowrap tabular-nums", className)} style={{ color: up ? UP : DOWN }} data-testid={testId}>
      {up ? "+" : "-"} {money(Math.abs(cents), currency)}
    </span>
  );
}

/** Etiqueta "↑ Entrada" (verde), "↓ Saída" (vermelha) ou neutra (saldo). */
export function KindBadge({ kind, label }: { kind: "in" | "out" | "neutral"; label?: string }) {
  const up = kind === "in";
  const Icon = kind === "neutral" ? Scale : up ? ArrowUp : ArrowDown;
  const color = kind === "neutral" ? NEUTRAL : up ? UP : DOWN;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ color, backgroundColor: `${color}26` }}
    >
      <Icon className="size-3.5" />
      {label ?? (up ? "Entrada" : "Saída")}
    </span>
  );
}

export function IconBox({ icon: Icon, color, className }: { icon: LucideIcon; color: string; className?: string }) {
  return (
    <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", className)} style={{ color, backgroundColor: `${color}26` }}>
      <Icon className="size-5" />
    </span>
  );
}

/** Título de página com subtítulo e, à direita, o seletor de mês (ou outro controle). */
export function PageTitle({ title, subtitle, right }: { title: string; subtitle: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {right}
    </div>
  );
}

/** Cabeçalho de painel: ícone num quadrado colorido, título e subtítulo; `right` fica à direita. */
export function SectionTitle({
  icon,
  title,
  subtitle,
  right,
  color = BLUE,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <IconBox icon={icon} color={color} />
        <div>
          <h2 className="text-lg leading-tight font-semibold">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

/** Cartão de indicador: ícone, título e valor grande. */
export function StatCard({
  icon,
  color,
  title,
  children,
  hint,
  compact,
}: {
  icon: LucideIcon;
  color: string;
  title: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  /** Cartões estreitos (cinco por linha): ícone e valor menores. */
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center rounded-xl border bg-card", compact ? "gap-2.5 p-3" : "gap-3 p-4")}>
      <IconBox icon={icon} color={color} className={compact ? "size-9" : "size-12"} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm leading-tight font-medium">{title}</span>
        <span className={compact ? "text-base" : "text-xl"}>{children}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

/** Caixa colorida da faixa de totais (fundo translúcido da cor). */
export function TotalChip({ color, children, testId }: { color: string; children: React.ReactNode; testId?: string }) {
  return (
    <span className="rounded-lg px-3 py-1.5 text-sm font-semibold" style={{ color, backgroundColor: `${color}26` }} data-testid={testId}>
      {children}
    </span>
  );
}

/** Faixa de totais no rodapé dos painéis: rótulo, caixas coloridas e o total final à direita. */
export function TotalsBar({ label, children, final }: { label: string; children: React.ReactNode; final: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/50 px-4 py-3 text-sm">
      <span className="font-semibold">{label}</span>
      {children}
      <span className="ml-auto flex items-center gap-3 text-base font-semibold">
        <span className="hidden h-6 w-px bg-border sm:block" />
        {final}
      </span>
    </div>
  );
}

/** Abas compactas de filtro com contagem, ex.: "Todas (6) | Entradas (3) | Saídas (3)". */
export function FilterTabs<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; count: number }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap rounded-lg border p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1 text-muted-foreground transition-colors hover:text-foreground",
            value === o.value && "bg-muted font-medium text-foreground shadow-[inset_0_-2px_0_#8b7cf6]",
          )}
        >
          {o.label} ({o.count})
        </button>
      ))}
    </div>
  );
}
