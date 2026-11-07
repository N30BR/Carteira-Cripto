"use client";

// Altseason: índice oficial da CoinMarketCap (API pública), capitalizações (TOTAL, TOTAL2, TOTAL3, OTHERS),
// dominâncias (BTC.D, ETH.D, USDT.D, USDC.D, stablecoins), relações entre ativos e o desempenho do Top 100.
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRightLeft, ArrowUpRight, ChevronRight, Layers, Trophy } from "lucide-react";
import type { CryptoOverview } from "@/lib/market/data";
import { PERF_PERIODS, breadth, changeOver, seasonOf, windowOf, type CoinRow, type PerfPeriod, type Pt } from "@/lib/market/calc";
import { MARKET_SERIES, type MarketId } from "@/lib/market/ids";
import { coinColor } from "@/components/dashboard/palette";
import { MiniArea, SeriesChart } from "@/components/market/series-chart";
import { cn } from "@/lib/utils";
import { ACCENT, BTC_ORANGE, Card, Chips, CoinMark, Delta, InfoTip, OpenInCharts, Panel, Unavailable, num, pct, usd, usdCompact } from "./ui";
import { SinceNote, chartDays, type GlobalPeriod } from "./cripto-view";

const ASI_WINDOWS = ["1D", "7D", "30D", "90D"] as const;
type AsiWin = (typeof ASI_WINDOWS)[number];
const ASI_DAYS: Record<AsiWin, number> = { "1D": 1, "7D": 7, "30D": 30, "90D": 90 };
const SERIES_COLOR: Record<MarketId, string> = {
  TOTAL: ACCENT,
  TOTAL2: "#60a5fa",
  TOTAL3: "#2dd4bf",
  OTHERS: "#f472b6",
  "BTC.D": BTC_ORANGE,
  "ETH.D": ACCENT,
  "USDT.D": "#26a17b",
  "USDC.D": "#2775ca",
  "STABLE.D": "#2dd4bf",
};

/** Índice de Altseason: valor, barra 0–100 com as regiões e histórico (com o market cap das altcoins em outro eixo). */
export function AltseasonIndexPanel({ data, compact }: { data: CryptoOverview; compact?: boolean }) {
  const [win, setWin] = useState<AsiWin>("90D");
  const a = data.altseason;
  const m = data.market.ok ? data.market.data : null;
  if (!a.ok) return <Unavailable reason={a.error} className="h-full min-h-64" />;
  const latest = a.data.latest;
  const idx = latest?.index ?? a.data.history.at(-1)?.[1] ?? null;
  const span = Math.max(ASI_DAYS[win], 2);
  const hist = windowOf(a.data.history, span);
  const alt = m ? windowOf(m.series.TOTAL2, span) : [];
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            Índice de Altseason <InfoTip text="Altcoin Season Index oficial da CoinMarketCap (API pública): das 100 maiores moedas (sem stablecoins e ativos atrelados), quantas superaram o Bitcoin nos últimos 90 dias. ≥ 75 = Altcoin Season; ≤ 25 = Bitcoin Season." />
          </h3>
          <p className="text-xs text-muted-foreground">Força relativa das altcoins contra o Bitcoin (CoinMarketCap).</p>
        </div>
        <Chips value={win} options={ASI_WINDOWS} onChange={setWin} label="Janela do índice de altseason" />
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="text-4xl font-semibold tabular-nums">{idx ?? "—"}</span>
          <span className="text-muted-foreground">/100</span>
          <p className="text-sm">{idx === null ? "—" : seasonOf(idx)}</p>
        </div>
        {latest && (
          <p className="text-right text-[11px] text-muted-foreground">
            Máx. 1 ano: {latest.yearlyHigh ?? "—"} {latest.yearlyHighDate && `(${latest.yearlyHighDate.split("-").reverse().join("/")})`}
            <br />
            Mín. 1 ano: {latest.yearlyLow ?? "—"} {latest.yearlyLowDate && `(${latest.yearlyLowDate.split("-").reverse().join("/")})`}
          </p>
        )}
      </div>
      <div>
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>Bitcoin Season</span>
          <span>Altcoin Season</span>
        </div>
        <div className="relative mt-1 h-2.5 rounded-full" style={{ background: `linear-gradient(90deg, ${BTC_ORANGE} 0 25%, #3f3f46 25% 75%, #3b82f6 75% 100%)` }}>
          {idx !== null && <span className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground" style={{ left: `${idx}%` }} aria-label={`Índice ${idx}`} />}
        </div>
      </div>
      <SeriesChart
        ariaLabel="Histórico do índice de altseason e market cap das altcoins"
        height={compact ? 190 : 230}
        left={(v) => usdCompact(v).replace("US$ ", "")}
        right={(v) => num(v, 0)}
        lines={[
          { points: alt, color: "#a1a1aa", label: "Market cap das alts (TOTAL2)" },
          { points: hist, color: BTC_ORANGE, label: "Índice de altseason", axis: "right" },
        ]}
      />
      <p className="text-[11px] text-muted-foreground">Eixo esquerdo: market cap das altcoins (US$). Eixo direito: índice (0–100). Histórico oficial de 90 dias; dias anteriores guardados localmente.</p>
    </Card>
  );
}

function CapCard({ id, m, days, period, big, now }: {
  now: number; id: MarketId; m: NonNullable<Extract<CryptoOverview["market"], { ok: true }>["data"]>; days: number; period: GlobalPeriod; big?: boolean }) {
  const info = MARKET_SERIES.find((x) => x.id === id)!;
  const isPct = info.unit === "pct";
  const pts = windowOf(m.series[id], chartDays(period));
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{info.short}</h3>
          <p className="truncate text-[11px] text-muted-foreground" title={info.description}>
            {info.name}
          </p>
        </div>
        <OpenInCharts symbol={id} small={!big} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn("font-semibold tabular-nums", big ? "text-2xl" : "text-xl")}>{isPct ? pct(m.current[id]) : usdCompact(m.current[id])}</span>
        <Delta v={changeOver(m.series[id], days, isPct ? "pp" : "pct")} kind={isPct ? "pp" : "pct"} />
      </div>
      <MiniArea points={pts as Pt[]} color={SERIES_COLOR[id]} height={big ? 90 : 70} />
      <SinceNote since={m.since[id]} days={days} now={now} />
    </Card>
  );
}

export function AltseasonSection({ data, period, days }: { data: CryptoOverview; period: GlobalPeriod; days: number }) {
  const m = data.market.ok ? data.market.data : null;
  return (
    <>
      <Panel id="altseason" title="Altseason" subtitle="Força das altcoins, estrutura do mercado e sinais de rotação de capital." icon={<Layers />}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <AltseasonIndexPanel data={data} />
          <Card className="flex flex-col">
            <h3 className="text-sm font-semibold">Estrutura do mercado</h3>
            <p className="mb-2 text-xs text-muted-foreground">Agregados e dominâncias (variação em {period}).</p>
            {m ? (
              <ul className="flex flex-col divide-y divide-border/60 text-sm">
                {(["TOTAL", "TOTAL2", "TOTAL3", "BTC.D", "ETH.D", "STABLE.D", "OTHERS"] as MarketId[]).map((id) => {
                  const info = MARKET_SERIES.find((x) => x.id === id)!;
                  const isPct = info.unit === "pct";
                  return (
                    <li key={id} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0">
                        <span className="block font-medium">{info.short}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{info.name}</span>
                      </span>
                      <span className="text-right">
                        <span className="block font-semibold tabular-nums">{isPct ? pct(m.current[id]) : usdCompact(m.current[id])}</span>
                        <span className="text-xs">
                          <Delta v={changeOver(m.series[id], days, isPct ? "pp" : "pct")} kind={isPct ? "pp" : "pct"} />
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Unavailable reason={data.market.ok ? "" : data.market.error} />
            )}
            {m?.notes.map((n) => (
              <p key={n} className="mt-2 text-[11px] text-amber-400/80">
                {n}
              </p>
            ))}
          </Card>
        </div>
        {m && (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {(["TOTAL", "TOTAL2", "TOTAL3"] as MarketId[]).map((id) => (
                <CapCard key={id} id={id} m={m} days={days} period={period} big now={data.now} />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {(["BTC.D", "ETH.D", "USDT.D", "USDC.D", "STABLE.D", "OTHERS"] as MarketId[]).map((id) => (
                <CapCard key={id} id={id} m={m} days={days} period={period} now={data.now} />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Metodologia: TOTAL = market cap das altcoins (CoinMarketCap) + BTC (Coin Metrics); TOTAL2 = altcoins; TOTAL3 = TOTAL2 − ETH; dominâncias = valor do ativo ÷ TOTAL.
              Stablecoins: soma da DefiLlama (todas as stablecoins listadas, sem dupla contagem). OTHERS = TOTAL − 10 maiores (CoinMarketCap), guardado dia a dia. O último ponto é o
              valor do momento (CoinMarketCap).
            </p>
          </>
        )}
      </Panel>
      <Relations data={data} />
      <TopPerformance data={data} />
    </>
  );
}

function Relations({ data }: { data: CryptoOverview }) {
  const coins = data.coins.ok ? data.coins.data : null;
  const btc = coins?.btc ?? null;
  const eth = coins?.top.find((c) => c.symbol === "ETH") ?? null;
  const ethBtc = btc && eth ? eth.price / btc.price : null;
  const items = [
    { label: "ETH/BTC", value: ethBtc === null ? "—" : `${num(ethBtc, 5)} BTC`, sub: "Preço do Ethereum em Bitcoin", symbol: "ETHBTC" },
    { label: "BTC/ETH", value: ethBtc === null ? "—" : `${num(1 / ethBtc, 2)} ETH`, sub: "Preço do Bitcoin em Ethereum (inverso)", symbol: "BTCETH" },
    { label: "BTC/USDT", value: btc ? usd(btc.price) : "—", sub: "Preço do Bitcoin em dólar", symbol: "BTCUSDT" },
  ];
  return (
    <Panel title="Relações entre ativos" subtitle="Pares para comparar a força relativa (gráficos completos na aba Gráficos)." icon={<ArrowRightLeft />}>
      <div className="grid gap-3 md:grid-cols-3">
        {items.map((it) => (
          <Card key={it.label} className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{it.label}</p>
              <p className="text-lg font-semibold tabular-nums">{it.value}</p>
              <p className="text-[11px] text-muted-foreground">{it.sub}</p>
            </div>
            <OpenInCharts symbol={it.symbol} />
          </Card>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Valores do momento pela CoinMarketCap; nos Gráficos, ETH/BTC e BTC/USDT vêm da Binance e BTC/ETH é o ETH/BTC invertido (mesmas velas).</p>
    </Panel>
  );
}

function PerfBar({ coin, period, max, rank }: { coin: CoinRow; period: PerfPeriod; max: number; rank: number }) {
  const v = coin.change[period];
  const color = coinColor(coin.symbol) ?? "#a1a1aa";
  return (
    <li className="grid grid-cols-[1.5rem_1.5rem_4.5rem_5rem_minmax(0,1fr)] items-center gap-2 py-1 text-sm">
      <span className="text-xs text-muted-foreground tabular-nums">{rank}</span>
      <CoinMark symbol={coin.symbol} color={color} />
      <span className="truncate font-medium" title={coin.name}>
        {coin.symbol}
      </span>
      <span className={cn("text-right tabular-nums", v === null ? "text-muted-foreground" : v >= 0 ? "text-green-500" : "text-red-500")}>
        {v === null ? "—" : `${v > 0 ? "+" : ""}${num(v)}%`}
      </span>
      <span className="h-2.5 overflow-hidden rounded-sm bg-muted/40">
        <span className="block h-full rounded-sm" style={{ width: `${v === null ? 0 : Math.min(100, (Math.abs(v) / max) * 100)}%`, background: v !== null && v >= 0 ? "#22c55e" : "#ef4444" }} />
      </span>
    </li>
  );
}

function TopPerformance({ data }: { data: CryptoOverview }) {
  const [period, setPeriod] = useState<PerfPeriod>("30D");
  const [full, setFull] = useState(false);
  const coins = useMemo(() => (data.coins.ok ? data.coins.data.top : []), [data.coins]);
  const withVal = useMemo(() => coins.filter((c) => c.change[period] !== null).sort((a, b) => (b.change[period] as number) - (a.change[period] as number)), [coins, period]);
  const br = breadth(coins, period);
  const max = Math.max(1, ...withVal.map((c) => Math.abs(c.change[period] as number)));
  const btc = data.coins.ok ? data.coins.data.btc : null;
  const gainers = withVal.filter((c) => (c.change[period] as number) > 0).slice(0, 10);
  const losers = [...withVal].reverse().filter((c) => (c.change[period] as number) < 0).slice(0, 10);
  return (
    <Panel
      title="Top 100 Coins — Performance"
      subtitle={`Variação de preço das 100 maiores criptomoedas por market cap no período (${period}; retorno acumulado do período, não a variação diária).`}
      icon={<Trophy />}
      right={<Chips value={period} options={PERF_PERIODS} onChange={setPeriod} label="Período do ranking" />}
    >
      {!data.coins.ok ? (
        <Unavailable reason={data.coins.error} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <Card className="grid grid-cols-2 gap-3 text-center sm:grid-cols-5">
              <Stat label="Em alta" value={String(br.up)} className="text-green-500" />
              <Stat label="Em queda" value={String(br.down)} className="text-red-500" />
              <Stat label="Variação mediana" value={br.median === null ? "—" : `${br.median > 0 ? "+" : ""}${num(br.median)}%`} />
              <Stat label="Variação média" value={br.mean === null ? "—" : `${br.mean > 0 ? "+" : ""}${num(br.mean)}%`} />
              <Stat label="Alts acima do BTC" value={br.beatBtc === null ? "—" : pct(br.beatBtc, 0)} />
            </Card>
            <div className="grid gap-3 md:grid-cols-2">
              <Card>
                <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                  <ArrowUpRight className="size-4 text-green-500" /> Maiores altas (Top 10)
                </h3>
                <ol>{gainers.length ? gainers.map((c, i) => <PerfBar key={c.id} coin={c} period={period} max={max} rank={i + 1} />) : <li className="text-xs text-muted-foreground">Nenhuma alta no período.</li>}</ol>
              </Card>
              <Card>
                <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                  <ArrowDownRight className="size-4 text-red-500" /> Maiores quedas (Top 10)
                </h3>
                <ol>{losers.length ? losers.map((c, i) => <PerfBar key={c.id} coin={c} period={period} max={max} rank={i + 1} />) : <li className="text-xs text-muted-foreground">Nenhuma queda no período.</li>}</ol>
              </Card>
            </div>
            {btc && (
              <Card className="border-[#f7931a]/60">
                <ul>
                  <li className="grid grid-cols-[1.5rem_6rem_5rem_minmax(0,1fr)] items-center gap-2 text-sm">
                    <CoinMark symbol="BTC" color={BTC_ORANGE} />
                    <span className="font-semibold">BTC (referência)</span>
                    <span className={cn("text-right font-semibold tabular-nums", (btc.change[period] ?? 0) >= 0 ? "text-green-500" : "text-red-500")}>
                      {btc.change[period] === null ? "—" : `${(btc.change[period] as number) > 0 ? "+" : ""}${num(btc.change[period])}%`}
                    </span>
                    <span className="h-2.5 overflow-hidden rounded-sm bg-muted/40">
                      <span className="block h-full rounded-sm" style={{ width: `${Math.min(100, (Math.abs(btc.change[period] ?? 0) / max) * 100)}%`, background: BTC_ORANGE }} />
                    </span>
                  </li>
                </ul>
              </Card>
            )}
            <button type="button" onClick={() => setFull((f) => !f)} aria-expanded={full} className="self-start rounded-md border border-border/70 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              {full ? "Esconder ranking completo" : `Ver ranking completo (${withVal.length})`}
            </button>
            {full && (
              <Card className="max-h-[32rem] overflow-auto">
                <ol aria-label="Ranking completo do período">
                  {withVal.map((c, i) => (
                    <PerfBar key={c.id} coin={c} period={period} max={max} rank={i + 1} />
                  ))}
                </ol>
              </Card>
            )}
            <p className="text-[11px] text-muted-foreground">
              Universo: as 100 maiores por market cap na CoinMarketCap, sem stablecoins e ouro tokenizado (preço atrelado). Variações acumuladas do período (24h, 7, 30 ou 90 dias),
              direto da fonte. Cada moeda pode ser aberta nos Gráficos pela busca de pares.
            </p>
          </div>
          <ComparableList />
        </div>
      )}
    </Panel>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className={cn("text-xl font-semibold tabular-nums", className)}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function ComparableList() {
  const items: { symbol: string; label: string; sub: string }[] = [
    ...MARKET_SERIES.map((s) => ({ symbol: s.id, label: s.short, sub: s.name })),
    { symbol: "ETHBTC", label: "ETH/BTC", sub: "Razão de preço ETH ÷ BTC" },
    { symbol: "BTCETH", label: "BTC/ETH", sub: "Razão de preço BTC ÷ ETH" },
    { symbol: "BTCUSDT", label: "BTC/USDT", sub: "Preço do BTC em USDT" },
  ];
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold">Gráficos comparáveis disponíveis</h3>
        <p className="text-xs text-muted-foreground">Séries de mercado que abrem na aba Gráficos (ou entram no Comparar) para aprofundar a análise da altseason.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => (
          <Link key={it.symbol} href={`/graficos?abrir=${encodeURIComponent(it.symbol)}`} className="rounded-lg border border-border/70 p-2 transition-colors hover:border-[#8b7cf6]/60">
            <span className="block text-sm font-semibold">{it.label}</span>
            <span className="block text-[11px] leading-tight text-muted-foreground">{it.sub}</span>
          </Link>
        ))}
      </div>
      <Link href="/graficos" className="flex items-center justify-between rounded-lg border border-[#8b7cf6]/50 bg-[#8b7cf6]/10 p-3 text-sm">
        <span>
          <span className="block font-semibold">Compare no Gráficos</span>
          <span className="block text-xs text-muted-foreground">Em Comparar → Procurar instrumento, busque por TOTAL3, USDT.D, ETH/BTC… e sobreponha as séries.</span>
        </span>
        <ChevronRight className="size-4" />
      </Link>
      <div className="rounded-lg border border-border/70 p-3 text-xs text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">Notas sobre a altseason</p>
        <ul className="flex flex-col gap-1">
          <li>• A altseason tende a se fortalecer quando a BTC.D perde força e o market cap das altcoins (TOTAL2/TOTAL3/OTHERS) avança.</li>
          <li>• Use dominâncias, market cap e pares (ETH/BTC, BTC/ETH) juntos para confirmar o contexto.</li>
          <li>• As variações são percentuais de preço no período e não são recomendação de investimento.</li>
        </ul>
      </div>
    </Card>
  );
}

