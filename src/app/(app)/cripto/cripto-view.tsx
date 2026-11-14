"use client";

// Aba Cripto: uma página contínua (referências img1…img6) com três seções — On-chain, ETFs BTC e Altseason.
// Período global (1D, 1S, 1M, 6M, 1A) = janela de visualização dos gráficos diários; a granularidade dos dados
// continua a real de cada fonte (diária), sem pontos inventados.
import { useState } from "react";
import { Activity, Bitcoin, CircleDollarSign, Gauge, Layers, Network, RefreshCcw, Target } from "lucide-react";
import type { CryptoOverview, OnchainItem } from "@/lib/market/data";
import { ONCHAIN_SERIES } from "@/lib/charts/onchain-ids";
import type { OnchainId } from "@/lib/charts/onchain-ids";
import { breadth, changeOver, seasonOf, windowOf, type Pt } from "@/lib/market/calc";
import { BOTTOM, TOP, type Category } from "@/lib/market/onchain-read";
import { MiniArea, SeriesChart } from "@/components/market/series-chart";
import { cn } from "@/lib/utils";
import { ACCENT, BTC_ORANGE, Badge, Card, Chips, Delta, InfoTip, Meter, Panel, Unavailable, num, pct, usd } from "./ui";
import { EtfSection } from "./etf-section";
import { FearGreedSection } from "./fear-greed-section";
import { AltseasonSection, AltseasonIndexPanel } from "./altseason-section";

import { GLOBAL_PERIODS, PERIOD_COOKIE, PERIOD_DAYS, type GlobalPeriod } from "@/lib/market/prefs";
export type { GlobalPeriod };
/** Janela mínima dos gráficos: em 1D, mostra a última semana (um único dia não forma um gráfico diário). */
export const chartDays = (p: GlobalPeriod) => Math.max(7, PERIOD_DAYS[p]);

const dateTime = (t: number, tz: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(t);
export const dateBr = (t: number) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(t);

const CAT_TONE = (c: Category): "green" | "red" | "purple" | "gray" | "amber" => (BOTTOM.includes(c) ? (c === "Fundo" || c === "Capitulação" ? "purple" : "green") : TOP.includes(c) ? (c === "Topo" || c === "Distribuição" ? "red" : "amber") : "gray");

/** Valor de cada indicador on-chain no formato da sua unidade. */
function fmtOnchain(id: OnchainId, v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  switch (id) {
    case "REALIZED_PRICE":
    case "STH_REALIZED_PRICE":
      return usd(v);
    case "EXCHANGE_NETFLOW":
      return `${v > 0 ? "+" : ""}${num(v, 0)} BTC`;
    case "SOPR":
    case "STH_SOPR":
      return num(v, 4);
    case "RESERVE_RISK":
      return num(v, 5);
    case "RHODL":
      return num(v, 0);
    case "NUPL":
      return num(v, 3);
    default:
      return num(v, 2);
  }
}

const COLORS: Record<OnchainId, string> = {
  MVRV_Z: "#8b7cf6",
  NUPL: "#22c55e",
  SOPR: "#f59e0b",
  STH_SOPR: "#f59e0b",
  REALIZED_PRICE: "#2dd4bf",
  STH_REALIZED_PRICE: "#fb7185",
  PUELL: "#a78bfa",
  RHODL: "#2dd4bf",
  RESERVE_RISK: "#a78bfa",
  EXCHANGE_NETFLOW: "#38bdf8",
};
const REF: Partial<Record<OnchainId, number>> = { SOPR: 1, STH_SOPR: 1, NUPL: 0, MVRV_Z: 0, EXCHANGE_NETFLOW: 0 };
const SOURCE_LABEL: Record<string, string> = { bgeometrics: "BGeometrics", calculo: "Cálculo próprio (Coin Metrics)", coinmetrics: "Coin Metrics" };

export function CriptoView({ data, timeZone, initialPeriod }: { data: CryptoOverview; timeZone: string; initialPeriod: GlobalPeriod }) {
  const [period, setPeriod] = useState<GlobalPeriod>(initialPeriod);
  const choose = (p: GlobalPeriod) => {
    setPeriod(p);
    document.cookie = `${PERIOD_COOKIE}=${p}; path=/; max-age=31536000; samesite=lax`;
  };
  const days = PERIOD_DAYS[period];
  const m = data.market.ok ? data.market.data : null;
  const chain = data.onchain;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Cripto</h1>
          <p className="text-sm text-muted-foreground">Indicadores on-chain, ETFs de Bitcoin e estrutura do mercado de altcoins.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Atualizado em: {dateTime(data.now, timeZone)} ({timeZone}) · período analisado: <strong className="text-foreground">{period}</strong> (janela dos gráficos diários; os dados seguem a frequência real de cada fonte)
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Chips value={period} options={GLOBAL_PERIODS} onChange={choose} label="Período analisado" />
          <nav aria-label="Seções da aba Cripto" className="flex gap-1 text-xs">
            {[
              ["#onchain", "On-chain"],
              ["#etfs", "ETFs BTC"],
              ["#altseason", "Altseason"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                onClick={(e) => {
                  e.preventDefault();
                  document.querySelector(href)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="rounded-md border border-border/70 px-2 py-1 text-muted-foreground hover:border-[#8b7cf6]/60 hover:text-foreground"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <TopCards data={data} period={period} days={days} />

      {/* Visão geral: dominâncias e índice de altseason */}
      <Panel title="Visão geral do mercado cripto" subtitle="Dominâncias de BTC, ETH e stablecoins no período selecionado." icon={<Target />}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Card>
            {m ? (
              <>
                <div className="mb-3 grid grid-cols-3 gap-3">
                  {(
                    [
                      ["BTC.D", "BTC Dominância", BTC_ORANGE],
                      ["ETH.D", "ETH Dominância", ACCENT],
                      ["STABLE.D", "Stable Dominância", "#2dd4bf"],
                    ] as const
                  ).map(([id, label, color]) => (
                    <div key={id} className="min-w-0">
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="size-2 rounded-full" style={{ background: color }} />
                        {label}
                      </span>
                      <span className="block text-xl font-semibold tabular-nums">{pct(m.current[id])}</span>
                      <span className="text-xs">
                        <Delta v={changeOver(m.series[id], days, "pp")} kind="pp" />
                      </span>
                    </div>
                  ))}
                </div>
                <SeriesChart
                  ariaLabel="Dominâncias de BTC, ETH e stablecoins"
                  height={240}
                  left={(v) => `${num(v, 0)}%`}
                  lines={[
                    { points: windowOf(m.series["BTC.D"], chartDays(period)), color: BTC_ORANGE, label: "BTC.D", area: true },
                    { points: windowOf(m.series["ETH.D"], chartDays(period)), color: ACCENT, label: "ETH.D", area: true },
                    { points: windowOf(m.series["STABLE.D"], chartDays(period)), color: "#2dd4bf", label: "Stable.D", area: true },
                  ]}
                />
                <SinceNote since={m.since["BTC.D"]} days={days} now={data.now} />
              </>
            ) : (
              <Unavailable reason={data.market.ok ? "" : data.market.error} className="h-64" />
            )}
          </Card>
          <AltseasonIndexPanel data={data} compact />
        </div>
      </Panel>

      {/* Fear and Greed (CoinMarketCap): logo abaixo da visão geral, largura total */}
      <FearGreedSection data={data.fearGreed} now={data.now} timeZone={timeZone} />

      <OnchainCards items={chain.items} period={period} days={days} consolidated={chain.consolidated} now={data.now} />
      <OnchainDeep data={data} />
      <EtfSection data={data} />
      <AltseasonSection data={data} period={period} days={days} />

      <footer className="pb-4 text-center text-xs text-muted-foreground">
        Fontes: CoinMarketCap (API pública), Coin Metrics (API comunitária), DefiLlama, BGeometrics{data.etf.ok ? ", SoSoValue" : ""}. Nada aqui é recomendação de investimento; os
        indicadores descrevem regiões históricas, não preveem preços.
      </footer>
    </div>
  );
}

/** Aviso quando o histórico guardado ainda não cobre o período pedido. */
export function SinceNote({ since, days, now }: { since: number | null; days: number; now: number }) {
  if (since === null) return null;
  const covered = (now - since) / 86_400_000;
  if (covered + 1 >= days) return null;
  return <p className="mt-2 text-[11px] text-amber-400/80">Histórico disponível desde {dateBr(since)} (a série é guardada dia a dia e cresce com o tempo).</p>;
}

// ---------- cartões do topo ----------

function TopCard({ icon, label, value, sub, extra, color }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode; extra?: React.ReactNode; color?: string }) {
  return (
    <Card className="flex min-w-0 gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted/50 [&_svg]:size-5" style={{ color: color ?? "#a888c0" }}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
        {sub && <p className="truncate text-xs">{sub}</p>}
        {extra && <p className="truncate text-[11px] text-muted-foreground">{extra}</p>}
      </div>
    </Card>
  );
}

const perfPeriodOf = (p: GlobalPeriod) => (p === "1D" ? "1D" : p === "1S" ? "7D" : p === "1M" ? "30D" : "90D");

function TopCards({ data, period, days }: { data: CryptoOverview; period: GlobalPeriod; days: number }) {
  const m = data.market.ok ? data.market.data : null;
  const asi = data.altseason.ok ? data.altseason.data.latest : null;
  const etf = data.etf.ok ? data.etf.data : null;
  const lastEtf = etf?.total.filter((r) => r.netInflow !== null).at(-1);
  const c = data.onchain.consolidated;
  const pp = perfPeriodOf(period);
  const br = data.coins.ok ? breadth(data.coins.data.top, pp) : null;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <TopCard
        icon={<Layers />}
        label="Índice de Altseason"
        value={asi ? <>{asi.index}<span className="text-sm text-muted-foreground">/100</span></> : "—"}
        sub={asi ? seasonOf(asi.index) : data.altseason.ok ? "Dados indisponíveis" : data.altseason.error}
        extra="CoinMarketCap (oficial)"
      />
      <TopCard
        icon={<Bitcoin />}
        color={BTC_ORANGE}
        label="BTC Dominância"
        value={pct(m?.current["BTC.D"])}
        sub={m ? <Delta v={changeOver(m.series["BTC.D"], days, "pp")} kind="pp" /> : "Dados indisponíveis"}
        extra={`variação em ${period}`}
      />
      <TopCard
        icon={<CircleDollarSign />}
        color="#2dd4bf"
        label="Stable Dominância"
        value={pct(m?.current["STABLE.D"])}
        sub={m ? <Delta v={changeOver(m.series["STABLE.D"], days, "pp")} kind="pp" /> : "Dados indisponíveis"}
        extra={`variação em ${period}`}
      />
      <TopCard
        icon={<Activity />}
        color="#22c55e"
        label="Fluxo ETFs BTC"
        value={lastEtf ? <span className={(lastEtf.netInflow ?? 0) >= 0 ? "text-green-500" : "text-red-500"}>{(lastEtf.netInflow ?? 0) >= 0 ? "+" : ""}{compact(lastEtf.netInflow)}</span> : "—"}
        sub={lastEtf ? `Último dia (${dateBr(Date.parse(lastEtf.date))})` : data.etf.ok ? "Sem sessões" : "Fonte não configurada"}
        extra="fluxo líquido (não é AUM)"
      />
      <TopCard
        icon={<Network />}
        label="Sinal On-chain"
        value={c.state}
        sub={c.score === null ? "posição do ciclo indisponível" : `posição do ciclo ${c.score}/100`}
        extra={`${c.available} de ${c.total} indicadores`}
      />
      <TopCard
        icon={<RefreshCcw />}
        label="Rotação das Alts"
        value={br?.beatBtc === null || br?.beatBtc === undefined ? "—" : pct(br.beatBtc, 0)}
        sub={br ? `superam o BTC (${pp})` : data.coins.ok ? "—" : data.coins.error}
        extra={br ? `mediana ${br.median === null ? "—" : `${br.median > 0 ? "+" : ""}${num(br.median)}%`} · Top 100` : undefined}
      />
    </div>
  );
}

const compact = (v: number | null | undefined) => {
  if (v === null || v === undefined) return "—";
  const a = Math.abs(v);
  const s = v < 0 ? "-" : "";
  return a >= 1e9 ? `${s}US$ ${num(a / 1e9, 2)} bi` : `${s}US$ ${num(a / 1e6, 1)} mi`;
};

// ---------- on-chain: os 10 cartões e a leitura consolidada ----------

function infoOf(id: OnchainId) {
  return ONCHAIN_SERIES.find((o) => o.id === id)!;
}

function OnchainCard({ it, days, period, now }: { it: OnchainItem; days: number; period: GlobalPeriod; now: number }) {
  const info = infoOf(it.id);
  const r = it.reading;
  const win = windowOf(it.points, chartDays(period));
  const change = it.id === "EXCHANGE_NETFLOW" ? null : changeOver(it.points, days, "pct");
  const lastAt = it.last?.[0] ?? null;
  const late = lastAt !== null && now - lastAt > 3 * 86_400_000;
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">{info.short === info.name ? info.name : `${info.short}`}</h3>
        <InfoTip text={`${info.name}. ${info.description} ${info.purpose}${info.note ? ` ${info.note}` : ""}`} />
      </div>
      {!it.ok ? (
        <Unavailable reason={it.error ?? "Sem dados"} className="min-h-28" />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-2xl font-semibold tabular-nums">{fmtOnchain(it.id, it.last?.[1])}</span>
            {change !== null && <Delta v={change} />}
            {r && <Badge tone={CAT_TONE(r.category)}>{r.category}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{info.description}</p>
          <MiniArea points={win as Pt[]} color={COLORS[it.id]} />
          {r ? (
            <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
              <span className="text-foreground/90">{r.label}</span>
              <span className="flex items-center gap-2">
                Intensidade {r.intensity}/100 <Meter value={r.intensity} color={TOP.includes(r.category) ? "#f59e0b" : BOTTOM.includes(r.category) ? "#22c55e" : "#71717a"} />
              </span>
              <span>Posição histórica: {Math.round(r.position)}º percentil (desde 2012)</span>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">Histórico insuficiente para classificar (sem nota artificial).</p>
          )}
          <p className={cn("mt-auto text-[11px]", late || it.stale ? "text-amber-400/90" : "text-muted-foreground")}>
            {SOURCE_LABEL[it.source ?? ""] ?? it.source} · último dado {lastAt ? dateBr(lastAt) : "—"}
            {it.stale ? " · guardado (fonte não consultada agora)" : late ? " · defasado" : ""}
          </p>
        </>
      )}
    </Card>
  );
}

function OnchainCards({ items, period, days, consolidated: c, now }: { items: OnchainItem[]; period: GlobalPeriod; days: number; consolidated: CryptoOverview["onchain"]["consolidated"]; now: number }) {
  return (
    <Panel id="onchain" title="On-chain (visão completa)" subtitle="Os 10 indicadores on-chain do ciclo, com valor atual, leitura e tendência recente." icon={<Network />}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((it) => (
          <OnchainCard key={it.id} it={it} days={days} period={period} now={now} />
        ))}
        <Card className="flex flex-col gap-3 md:col-span-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold">Leitura consolidada do ciclo</h3>
              <p className="text-xs text-muted-foreground">
                {c.available} de {c.total} indicadores atualizados · indicadores parecidos contam como um grupo só
              </p>
            </div>
            <InfoTip text="Posição do ciclo = média das posições históricas (percentis) de 5 grupos: valor, lucro realizado, mineradores, longo prazo e fluxos. Não é probabilidade de alta ou queda. Faixas: <15 Capitulação, <35 Acumulação, <65 Expansão, <85 Aquecimento, ≥85 Distribuição. Com menos de 3 grupos: Indefinido." />
          </div>
          <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_auto] items-center gap-3">
            <Count label="Sinais de fundo" value={c.bottom} color="text-green-500" />
            <Count label="Sinais de topo" value={c.top} color="text-red-500" />
            <Count label="Neutros" value={c.neutral} color="text-foreground" />
            <GaugeView score={c.score} state={c.state} />
          </div>
          <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            {c.groups.map((g) => (
              <li key={g.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{g.label}</span>
                <span className="w-16 shrink-0">{g.position === null ? <span>—</span> : <Meter value={g.position} />}</span>
                <span className="w-8 text-right tabular-nums">{g.position === null ? "—" : Math.round(g.position)}</span>
              </li>
            ))}
          </ul>
          {(c.convergences.length > 0 || c.divergences.length > 0) && (
            <div className="grid gap-1 text-xs">
              {c.convergences.map((t) => (
                <p key={t}>
                  <strong className="text-green-400">Convergência:</strong> {t}
                </p>
              ))}
              {c.divergences.map((t) => (
                <p key={t}>
                  <strong className="text-amber-400">Divergência:</strong> {t}
                </p>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Panel>
  );
}

function Count({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-3xl font-semibold tabular-nums", color)}>{value}</p>
    </div>
  );
}

function GaugeView({ score, state }: { score: number | null; state: string }) {
  const r = 46;
  const len = Math.PI * r;
  const frac = score === null ? 0 : score / 100;
  return (
    <div className="flex flex-col items-center">
      <svg width="120" height="70" viewBox="0 0 120 70" aria-label={`Posição do ciclo ${score ?? "indisponível"}`} role="img">
        <path d="M14 62 A46 46 0 0 1 106 62" fill="none" stroke="#27272a" strokeWidth="9" strokeLinecap="round" />
        <path d="M14 62 A46 46 0 0 1 106 62" fill="none" stroke={ACCENT} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${len * frac} ${len}`} />
        <text x="60" y="58" textAnchor="middle" className="fill-foreground text-[20px] font-semibold">
          {score ?? "—"}
        </text>
      </svg>
      <Badge tone="purple">{state}</Badge>
    </div>
  );
}

// ---------- on-chain aprofundado, modelos e resumo ----------

function stats(points: Pt[]) {
  const year = windowOf(points, 365).map((p) => p[1]);
  if (!year.length) return null;
  return { mean: year.reduce((s, v) => s + v, 0) / year.length, min: Math.min(...year), max: Math.max(...year) };
}

function movingAverage(points: Pt[], n: number): Pt[] {
  const out: Pt[] = [];
  let acc = 0;
  for (let i = 0; i < points.length; i++) {
    acc += points[i][1];
    if (i >= n) acc -= points[i - n][1];
    if (i >= n - 1) out.push([points[i][0], acc / n]);
  }
  return out;
}

function DeepChart({ it, ma }: { it: OnchainItem | undefined; ma?: number }) {
  if (!it) return null;
  const info = infoOf(it.id);
  const s = stats(it.points);
  const year = windowOf(it.points, 365);
  const d = it.id === "RESERVE_RISK" ? 5 : it.id === "STH_SOPR" ? 3 : 2;
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{info.short} {info.short !== info.name && <span className="font-normal text-muted-foreground">({info.name})</span>}</h3>
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold tabular-nums">{fmtOnchain(it.id, it.last?.[1])}</span>
            {it.reading && <Badge tone={CAT_TONE(it.reading.category)}>{it.reading.category}</Badge>}
          </div>
        </div>
        {s && (
          <div className="flex gap-1.5 text-center text-[11px]">
            {(
              [
                ["Média (1 ano)", s.mean],
                ["Mín. (1 ano)", s.min],
                ["Máx. (1 ano)", s.max],
              ] as const
            ).map(([l, v]) => (
              <span key={l} className="rounded-md border border-border/70 px-2 py-1">
                <span className="block text-muted-foreground">{l}</span>
                <span className="font-semibold tabular-nums">{num(v, d)}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      {it.ok ? (
        <SeriesChart
          ariaLabel={`${info.short}, último ano`}
          height={200}
          left={(v) => num(v, d)}
          refLine={REF[it.id]}
          lines={[{ points: year, color: ma ? ACCENT : COLORS[it.id], label: info.short, area: true }, ...(ma ? [{ points: windowOf(movingAverage(it.points, ma), 365), color: BTC_ORANGE, label: `Média móvel (${ma}d)` }] : [])]}
        />
      ) : (
        <Unavailable reason={it.error ?? "Sem dados"} className="h-48" />
      )}
    </Card>
  );
}

function OnchainDeep({ data }: { data: CryptoOverview }) {
  const by = (id: OnchainId) => data.onchain.items.find((x) => x.id === id);
  const models = data.onchain.models;
  const summary = interpret(data);
  return (
    <>
      <Panel title="On-chain (continuação)" subtitle="Histórico de 1 ano dos principais indicadores de valor, comportamento e risco do ciclo." icon={<Network />}>
        <div className="grid gap-3 lg:grid-cols-2">
          <DeepChart it={by("MVRV_Z")} />
          <DeepChart it={by("NUPL")} />
          <DeepChart it={by("STH_SOPR")} ma={7} />
          <DeepChart it={by("RESERVE_RISK")} ma={90} />
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel title="Modelos e ciclos do BTC" subtitle="Modelos complementares (não substituem os indicadores on-chain)." icon={<Layers />}>
          <ul className="flex flex-col divide-y divide-border/60">
            {models.map((mo) => (
              <li key={mo.id} className="grid grid-cols-[minmax(0,10rem)_auto_minmax(0,1fr)] items-center gap-3 py-2.5 text-sm">
                <span className="font-medium">{mo.name}</span>
                <Badge tone={mo.tone === "up" ? "green" : mo.tone === "down" ? "red" : mo.tone === "na" ? "gray" : "amber"}>{mo.state}</Badge>
                <span className="text-xs text-muted-foreground">
                  {mo.detail} <span className="text-muted-foreground/70">· {mo.source}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Resumo interpretativo" subtitle="Leitura integrada dos dados disponíveis — não é previsão nem recomendação." icon={<Gauge />}>
          <ul className="flex flex-col gap-2 text-sm">
            {summary.map(([title, text]) => (
              <li key={title} className="flex gap-2">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#8b7cf6]" />
                <span>
                  <strong>{title}:</strong> <span className="text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}

/** Frases montadas só com os dados disponíveis (sem previsões). */
function interpret(data: CryptoOverview): [string, string][] {
  const by = (id: OnchainId) => data.onchain.items.find((x) => x.id === id);
  const out: [string, string][] = [];
  const c = data.onchain.consolidated;
  out.push(["Ciclo", c.score === null ? "posição indisponível (menos de 3 grupos com dados)." : `posição ${c.score}/100 (${c.state}), com ${c.bottom} sinais do lado frio e ${c.top} do lado quente entre ${c.available} indicadores.`]);
  const z = by("MVRV_Z");
  const n = by("NUPL");
  if (z?.reading || n?.reading)
    out.push(["Valor on-chain", [z?.reading && `MVRV Z-Score ${fmtOnchain("MVRV_Z", z.last?.[1])} (${z.reading.category.toLowerCase()})`, n?.reading && `NUPL ${fmtOnchain("NUPL", n.last?.[1])} (${n.reading.label.toLowerCase()})`].filter(Boolean).join("; ") + "."]);
  const s = by("STH_SOPR");
  if (s?.reading) out.push(["Detentores de curto prazo", `STH-SOPR em ${fmtOnchain("STH_SOPR", s.last?.[1])}: ${s.reading.label.toLowerCase()}.`]);
  const rr = by("RESERVE_RISK");
  if (rr?.reading) out.push(["Risco relativo", `Reserve Risk em ${fmtOnchain("RESERVE_RISK", rr.last?.[1])}, ${Math.round(rr.reading.position)}º percentil histórico (${rr.reading.category.toLowerCase()}).`]);
  const nf = by("EXCHANGE_NETFLOW");
  if (nf?.reading) out.push(["Corretoras", `${nf.reading.label} — entrada não significa venda, nem saída significa compra.`]);
  const band = data.onchain.models.find((x) => x.id === "bmsb");
  const pi = data.onchain.models.find((x) => x.id === "pi");
  if (band && band.tone !== "na") out.push(["Modelos", `Bull Market Support Band: ${band.state.toLowerCase()} da banda; Pi Cycle: ${pi?.state.toLowerCase() ?? "indisponível"}.`]);
  if (c.divergences.length) out.push(["Atenção", c.divergences[0]]);
  if (c.attention.length) out.push(["Sinais intensos", c.attention.map((id) => infoOf(id).short).join(", ") + " (intensidade ≥ 70/100)."]);
  return out;
}

