"use client";

// Peças visuais da aba Cripto (mesma identidade do restante: fundo preto, painéis escuros, roxo de destaque,
// verde/vermelho para variações, laranja para o Bitcoin).
import Link from "next/link";
import { ExternalLink, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export const UP = "text-green-500";
export const DOWN = "text-red-500";
export const BTC_ORANGE = "#f7931a";
export const ACCENT = "#8b7cf6";

const nf = (d: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** US$ compacto: US$ 2,55 tri / 392,18 bi / 621,4 mi. */
export function usdCompact(v: number | null | undefined, signed = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const sign = v < 0 ? "-" : signed && v > 0 ? "+" : "";
  const a = Math.abs(v);
  const body = a >= 1e12 ? `${nf(2).format(a / 1e12)} tri` : a >= 1e9 ? `${nf(2).format(a / 1e9)} bi` : a >= 1e6 ? `${nf(1).format(a / 1e6)} mi` : a >= 1e3 ? `${nf(1).format(a / 1e3)} mil` : nf(0).format(a);
  return `${sign}US$ ${body}`;
}
export const usd = (v: number | null | undefined, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `US$ ${nf(d).format(v)}`);
export const num = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : nf(d).format(v));
export const pct = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${nf(d).format(v)}%`);

/** Variação com cor e sinal: "pct" (%), "pp" (pontos percentuais) ou "abs". */
export function Delta({ v, kind = "pct", suffix }: { v: number | null | undefined; kind?: "pct" | "pp"; suffix?: string }) {
  if (v === null || v === undefined || !Number.isFinite(v)) return <span className="text-muted-foreground">—</span>;
  const zero = Math.abs(v) < 0.005;
  const text = `${v > 0 ? "+" : ""}${nf(2).format(v)}${kind === "pp" ? " p.p." : "%"}`;
  return (
    <span className={cn("tabular-nums", zero ? "text-muted-foreground" : v > 0 ? UP : DOWN)}>
      {!zero && (v > 0 ? "▲ " : "▼ ")}
      {text}
      {suffix && <span className="ml-1 text-[11px] text-muted-foreground">{suffix}</span>}
    </span>
  );
}

export function Panel({ id, title, subtitle, icon, right, children, className }: { id?: string; title: string; subtitle?: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-20 rounded-2xl border border-border/70 bg-[#0d0d10] p-4 sm:p-5", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon && <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#8b7cf6]/15 text-[#a888c0] [&_svg]:size-5">{icon}</span>}
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-border/70 bg-[#121216] p-3 sm:p-4", className)}>{children}</div>;
}

/** Selo do estado de um sinal. */
const TONES: Record<string, string> = {
  green: "border-green-500/30 bg-green-500/10 text-green-400",
  red: "border-red-500/30 bg-red-500/10 text-red-400",
  purple: "border-[#8b7cf6]/40 bg-[#8b7cf6]/15 text-[#c4b5fd]",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  gray: "border-border bg-muted/40 text-muted-foreground",
  orange: "border-orange-500/30 bg-orange-500/10 text-orange-400",
};
export function Badge({ children, tone = "gray", title }: { children: React.ReactNode; tone?: keyof typeof TONES; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone])}>
      {children}
    </span>
  );
}

/** Ícone "i" com explicação ao passar o mouse (e para leitores de tela). */
export function InfoTip({ text }: { text: string }) {
  return (
    <span title={text} aria-label={text} role="img" className="inline-grid shrink-0 cursor-help place-items-center text-muted-foreground hover:text-foreground">
      <Info className="size-4" aria-hidden />
    </span>
  );
}

/** Botões de período (1D, 7D...). */
export function Chips<T extends string>({ value, options, onChange, label, labels }: { value: T; options: readonly T[]; onChange: (v: T) => void; label: string; labels?: Partial<Record<T, string>> }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-border/70 bg-background/40 p-0.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={cn("rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground", value === o && "bg-muted text-foreground")}
        >
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}

/** "Abrir em Gráficos": abre o instrumento numa aba nova dos Gráficos (sem mexer nas abas existentes). */
export function OpenInCharts({ symbol, small }: { symbol: string; small?: boolean }) {
  return (
    <Link
      href={`/graficos?abrir=${encodeURIComponent(symbol)}`}
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-md border border-border/70 text-muted-foreground transition-colors hover:border-[#8b7cf6]/60 hover:text-foreground", small ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs")}
    >
      Abrir em Gráficos <ExternalLink className={small ? "size-3" : "size-3.5"} aria-hidden />
    </Link>
  );
}

export function Unavailable({ reason, className }: { reason: string; className?: string }) {
  return (
    <div className={cn("grid place-items-center rounded-lg border border-dashed border-border/70 p-4 text-center text-sm text-muted-foreground", className)}>
      <span>
        Dados indisponíveis
        <span className="block text-xs text-muted-foreground/70">{reason}</span>
      </span>
    </div>
  );
}

/** Monograma colorido da moeda (sem imagens externas). */
export function CoinMark({ symbol, color }: { symbol: string; color: string }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full text-[9px] font-bold" style={{ background: `${color}26`, color }} aria-hidden>
      {symbol.slice(0, 3)}
    </span>
  );
}

/** Intensidade 0–100 (barra). */
export function Meter({ value, color = ACCENT }: { value: number; color?: string }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </span>
  );
}
