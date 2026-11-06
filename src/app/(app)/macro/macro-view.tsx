"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { AssetRow, MacroItem, Panorama } from "@/lib/macro/panorama";
import type { Point } from "@/lib/macro/calc";
import {
  CURRENCY_INFO,
  MACRO_COOKIE,
  MACRO_CURRENCIES,
  MACRO_PERIODS,
  PERIOD_DAYS,
  convertUsd,
  type MacroPrefs,
} from "@/lib/macro/prefs";
import { cn } from "@/lib/utils";

/** Atualiza a página a cada 5 min (as fontes ficam em cache no servidor; respeita os limites delas). */
const AUTO_REFRESH = 5 * 60_000;
const UP = "text-green-500";
const DOWN = "text-red-500";

function savePrefs(next: MacroPrefs) {
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${MACRO_COOKIE}=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${secure}`;
}

const num = (v: number, digits = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const dateBr = (t: number | null | undefined, month = false) =>
  t ? new Date(t).toLocaleDateString("pt-BR", month ? { month: "short", year: "numeric", timeZone: "UTC" } : { timeZone: "UTC" }) : "—";

/** Variação colorida pela direção matemática (verde sobe, vermelho desce). */
function Change({ v, kind, label }: { v: number | null; kind: "pct" | "pp" | "pts"; label?: string }) {
  if (v === null || !Number.isFinite(v)) return <span className="text-muted-foreground">—</span>;
  const zero = Math.abs(v) < 0.005;
  const sign = v > 0 ? "+" : "";
  const text = kind === "pct" ? `${sign}${num(v)}%` : kind === "pp" ? `${sign}${num(v)} p.p.` : `${sign}${num(v)}`;
  return (
    <span className={cn("tabular-nums", zero ? "text-muted-foreground" : v > 0 ? UP : DOWN)}>
      {text}
      {label && <span className="ml-1 text-[11px] text-muted-foreground">{label}</span>}
    </span>
  );
}

/** Minigráfico (linha) em SVG; verde se terminou acima do começo, vermelho se abaixo. */
function Spark({ points, className, height = 32 }: { points: Point[]; className?: string; height?: number }) {
  if (points.length < 2) return <div className={cn("h-8", className)} aria-hidden />;
  const w = 120;
  const h = height;
  const ys = points.map((p) => p[1]);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const t0 = points[0][0];
  const tspan = points.at(-1)![0] - t0 || 1;
  const d = points.map(([t, v], i) => `${i ? "L" : "M"}${(((t - t0) / tspan) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`).join(" ");
  const up = points.at(-1)![1] >= points[0][1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-8 w-full", className)} aria-hidden>
      <path d={d} fill="none" stroke={up ? "#22c55e" : "#ef4444"} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const FLAG_COLOR: Record<string, string> = { US: "#3b82f6", EU: "#facc15", JP: "#ef4444", CN: "#f97316", BR: "#22c55e", GL: "#8b7cf6" };
function Flag({ code }: { code?: string }) {
  if (!code) return null;
  return (
    <span
      className="inline-grid h-4 min-w-6 place-items-center rounded-sm border px-0.5 text-[9px] font-bold tracking-wide"
      style={{ borderColor: `${FLAG_COLOR[code] ?? "#71717a"}99`, color: FLAG_COLOR[code] ?? "#a1a1aa" }}
      aria-hidden
    >
      {code}
    </span>
  );
}

function Unavailable({ reason }: { reason: string }) {
  return (
    <span className="block text-xs leading-snug text-muted-foreground" title={reason}>
      Indisponível · <span className="text-muted-foreground/70">{reason}</span>
    </span>
  );
}

const fmtValue = (it: MacroItem) => {
  if (it.display) return `${it.display}%`;
  if (it.value === null) return "—";
  if (it.unit === "%") return `${num(it.value)}%`;
  if (it.unit === "p.p.") return `${num(it.value)} p.p.`;
  if (it.unit === "US$ tri") return `US$ ${num(it.value)} tri`;
  if (it.unit === "pts") return num(it.value);
  return num(it.value, it.value < 10 ? 4 : 2);
};

/** Linha compacta: bandeira, nome, valor, variação e minigráfico. */
function Row({ it }: { it: MacroItem }) {
  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto_5rem] items-center gap-2 py-1.5">
      <Flag code={it.flag} />
      <span className={cn("min-w-0", it.unavailable && "col-span-3")}>
        <span className="block truncate text-sm font-medium">{it.label}</span>
        <span className="block truncate text-[11px] text-muted-foreground" title={it.note ?? it.sub}>
          {it.sub}
        </span>
        {it.unavailable && <Unavailable reason={it.unavailable} />}
      </span>
      {it.unavailable ? null : (
        <>
          <span className="text-right">
            <span className="block text-sm font-semibold tabular-nums">{fmtValue(it)}</span>
            <span className="block text-[11px]">
              <Change v={it.change} kind={it.changeKind} />
            </span>
          </span>
          <Spark points={it.spark} />
        </>
      )}
    </li>
  );
}

function Section({ title, subtitle, children, right }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-wider text-[#a888c0] uppercase">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Card de indicador/índice (grade da 2ª e 3ª linhas). */
function Tile({ it }: { it: MacroItem }) {
  return (
    <Card className="gap-1 py-3">
      <CardContent className="flex flex-col gap-1 px-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold">
            <Flag code={it.flag} />
            {it.label}
          </span>
          {!it.unavailable && <span className="text-[11px] text-muted-foreground">{dateBr(it.asOf)}</span>}
        </div>
        <span className="truncate text-[11px] text-muted-foreground" title={it.note ?? it.sub}>
          {it.sub}
        </span>
        {it.unavailable ? (
          <div className="py-2">
            <Unavailable reason={it.unavailable} />
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-lg font-semibold tabular-nums">{fmtValue(it)}</span>
              <Change v={it.change} kind={it.changeKind} />
            </div>
            <Spark points={it.spark} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function MacroView({ data, initialPrefs }: { data: Panorama; initialPrefs: MacroPrefs }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(initialPrefs);
  const update = (next: MacroPrefs) => {
    setPrefs(next);
    savePrefs(next);
  };
  useEffect(() => {
    const id = setInterval(() => router.refresh(), AUTO_REFRESH);
    return () => clearInterval(id);
  }, [router]);
  const liquidityCharts = data.liquidity.filter((l) => ["US", "CN", "JP", "GLOBAL"].includes(l.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Panorama Macro</h1>
          <p className="text-sm text-muted-foreground">Visão macroeconômica global: câmbio, juros, liquidez, mercados e ativos estratégicos.</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Atualizado às {new Date(data.fetchedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · atualiza sozinho a cada 5 min
        </p>
      </div>

      {/* 1ª linha: câmbio, juros e liquidez */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="text-base">Câmbio (Principais)</CardTitle>
            <p className="text-xs text-muted-foreground">Taxas de referência do BCE (1 por dia útil); variação contra o dia útil anterior.</p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60" aria-label="Câmbio">
              {data.fx.map((it) => (
                <Row key={it.id} it={it} />
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="text-base">Taxas de Juros (Bancos Centrais)</CardTitle>
            <p className="text-xs text-muted-foreground">Taxas oficiais em % ao ano; variação em p.p. contra a decisão anterior.</p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60" aria-label="Taxas de juros">
              {data.rates.map((it) => (
                <li key={it.id} className="flex items-center gap-3 py-2">
                  <Flag code={it.flag} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{it.label}</span>
                    <span className="block text-[11px] text-muted-foreground" title={it.note}>
                      {it.sub}
                    </span>
                    {it.unavailable ? (
                      <Unavailable reason={it.unavailable} />
                    ) : (
                      <span className="block text-[11px] text-muted-foreground">
                        Última decisão: {it.decidedAt ? dateBr(it.decidedAt) : "sem mudança no período"} · dado de {dateBr(it.asOf)}
                      </span>
                    )}
                  </span>
                  {it.unavailable ? null : (
                    <span className="text-right">
                      <span className="block text-lg font-semibold tabular-nums">{fmtValue(it)}</span>
                      <Change v={it.change} kind="pp" />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="text-base">Liquidez Global (M2 / Agregados)</CardTitle>
            <p className="text-xs text-muted-foreground">Em trilhões de US$; variação anual.</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="divide-y divide-border/60" aria-label="Liquidez global">
              {data.liquidity.map((it) => (
                <li key={it.id} className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 py-1.5">
                  <Flag code={it.flag} />
                  <span className={cn("min-w-0", it.unavailable && "col-span-2")}>
                    <span className="block truncate text-sm font-medium">{it.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {it.unavailable ? it.sub : `Ref.: ${dateBr(it.asOf, true)}`}
                    </span>
                    {it.unavailable && <Unavailable reason={it.unavailable} />}
                  </span>
                  {it.unavailable ? null : (
                    <span className="text-right">
                      <span className="block text-sm font-semibold tabular-nums">{fmtValue(it)}</span>
                      <span className="block text-[11px]">
                        <Change v={it.change} kind="pct" label={it.changeLabel} />
                      </span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Evolução da liquidez">
              {liquidityCharts.map((it) => (
                <div key={it.id} className="rounded-md border border-border/60 p-1.5">
                  <p className="truncate text-[11px] text-muted-foreground">{it.label.replace(" (M2)", "")}</p>
                  {it.unavailable ? <p className="py-2 text-[11px] text-muted-foreground">Indisponível</p> : <Spark points={it.spark} height={40} className="h-10" />}
                </div>
              ))}
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">{data.liquidityNote}</p>
          </CardContent>
        </Card>
      </div>

      {/* 2ª linha: indicadores macro */}
      <Section title="Indicadores Macro" subtitle="Risco, liquidez e sentimento de mercado">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {data.indicators.map((it) => (
            <Tile key={it.id} it={it} />
          ))}
        </div>
      </Section>

      {/* 3ª linha: bolsas */}
      <Section title="Mercados Globais" subtitle="Principais bolsas mundiais — em pontos, último fechamento">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {data.markets.map((it) => (
            <Tile key={it.id} it={it} />
          ))}
        </div>
      </Section>

      {/* 4ª linha: ativos principais (período e moeda só aqui) */}
      <Assets rows={data.assets} usdIn={data.usdIn} prefs={prefs} onPrefs={update} />

      <p className="text-[11px] text-muted-foreground">
        Fontes: BCE (câmbio, via Frankfurter; M2 da Zona do Euro), FRED/Federal Reserve (juros, Treasuries, VIX, spread, curva, M2 dos EUA, S&amp;P 500,
        Nasdaq 100, Dow Jones, Nikkei 225), Banco do Japão (taxa call e M2) e Binance (ativos). Cores indicam a direção da variação, não uma avaliação
        econômica. Dados indisponíveis aparecem como tal — nada é estimado no lugar.
      </p>
    </div>
  );
}

function Assets({
  rows,
  usdIn,
  prefs,
  onPrefs,
}: {
  rows: AssetRow[];
  usdIn: Panorama["usdIn"];
  prefs: MacroPrefs;
  onPrefs: (p: MacroPrefs) => void;
}) {
  const cur = CURRENCY_INFO[prefs.currency];
  const price = (usd: number | null) => {
    const v = convertUsd(usd, prefs.currency, usdIn);
    if (v === null) return "—";
    const digits = prefs.currency === "BTC" ? (v < 1 ? 8 : 4) : prefs.currency === "JPY" ? 0 : v < 10 ? 3 : 2;
    return `${cur.symbol} ${num(v, digits)}`;
  };
  const sparkFor = useMemo(
    () => (r: AssetRow) => {
      if (prefs.period === "1D") return r.sparkDay;
      const last = r.sparkYear.at(-1);
      return last ? r.sparkYear.filter(([t]) => t >= last[0] - PERIOD_DAYS[prefs.period] * 86_400_000) : [];
    },
    [prefs.period],
  );
  const selector = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border p-0.5 text-xs" role="group" aria-label="Período do minigráfico">
        {MACRO_PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={p === prefs.period}
            onClick={() => onPrefs({ ...prefs, period: p })}
            className={cn("rounded-md px-2.5 py-1 text-muted-foreground transition-colors hover:text-foreground", p === prefs.period && "bg-[#8b7cf6]/30 font-semibold text-foreground")}
          >
            {p}
          </button>
        ))}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Moeda de referência" className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold hover:bg-muted">
            {cur.symbol} {prefs.currency}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {MACRO_CURRENCIES.map((c) => (
            <DropdownMenuItem key={c} onSelect={() => onPrefs({ ...prefs, currency: c })} className={cn(c === prefs.currency && "bg-muted")}>
              <span className="w-6 font-semibold">{CURRENCY_INFO[c].symbol}</span> {c} — {CURRENCY_INFO[c].name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
  return (
    <Section title="Ativos Principais" subtitle="Commodities, cripto e ativos globais" right={selector}>
      <Card className="py-0">
        <CardContent className="overflow-x-auto px-0">
          <table className="w-full min-w-[860px] text-sm" aria-label="Ativos principais">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Ativo</th>
                <th className="px-2 py-2 text-left font-medium">Ticker</th>
                <th className="px-2 py-2 text-right font-medium">Preço ({prefs.currency})</th>
                {MACRO_PERIODS.map((p) => (
                  <th key={p} className={cn("px-2 py-2 text-right font-medium", p === prefs.period && "text-foreground")}>
                    {p}
                  </th>
                ))}
                <th className="w-32 px-3 py-2 text-right font-medium">Gráfico ({prefs.period})</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2">
                    <span className="block font-medium">{r.name}</span>
                    <span className="block text-[11px] text-muted-foreground" title={r.source}>
                      {r.per}
                    </span>
                  </td>
                  <td className="px-2 py-2 font-mono text-xs">{r.ticker}</td>
                  {r.unavailable ? (
                    <td colSpan={8} className="px-2 py-2 text-right">
                      <Unavailable reason={r.unavailable} />
                    </td>
                  ) : (
                    <>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">{price(r.usd)}</td>
                      {MACRO_PERIODS.map((p) => (
                        <td key={p} className="px-2 py-2 text-right text-xs">
                          <Change v={r.changes[p]} kind="pct" />
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        <Spark points={sparkFor(r)} />
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-[11px] text-muted-foreground">
        Preços: Bitcoin à vista e demais pelos contratos perpétuos da Binance (seguem o mercado à vista), convertidos de US$ pela taxa do BCE (EUR, JPY,
        BRL) ou pelo preço do BTC. As variações são sempre calculadas em US$ (trocar a moeda não muda os percentuais). “—” = histórico ainda curto.
      </p>
    </Section>
  );
}
