"use client";

// ETFs de Bitcoin à vista (EUA). Fluxo líquido ≠ patrimônio (AUM) ≠ valorização do BTC; também não é o Exchange
// Netflow on-chain. Fins de semana e feriados: vale a última sessão divulgada (com a data); dias sem pregão não
// viram zero.
import { useMemo, useState } from "react";
import { BarChart3, Info, Layers } from "lucide-react";
import type { CryptoOverview } from "@/lib/market/data";
import { flowSum } from "@/lib/market/etf";
import { SeriesChart, MiniArea } from "@/components/market/series-chart";
import { cn } from "@/lib/utils";
import { BTC_ORANGE, Badge, Card, Chips, Panel, usdCompact } from "./ui";
import { dateBr } from "./cripto-view";

const WINDOWS = ["1D", "7D", "30D", "90D"] as const;
type Win = (typeof WINDOWS)[number];
const WIN_DAYS: Record<Win, number> = { "1D": 1, "7D": 7, "30D": 30, "90D": 90 };
const FUND_COLORS = [BTC_ORANGE, "#8b7cf6", "#22c55e", "#38bdf8", "#fb7185", "#facc15", "#2dd4bf", "#a3e635"];

/** Soma acumulada ponto a ponto (começa no primeiro valor). */
function cumulative(points: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let acc = 0;
  for (const [x, v] of points) {
    acc += v;
    out.push([x, acc]);
  }
  return out;
}

const tone = (v: number | null) => (v === null ? "text-muted-foreground" : v >= 0 ? "text-green-500" : "text-red-500");

export function EtfSection({ data }: { data: CryptoOverview }) {
  const etf = data.etf;
  return (
    <Panel id="etfs" title="ETFs BTC" subtitle="Fluxos diários dos ETFs de Bitcoin à vista (EUA): entrada e saída líquida de capital." icon={<BarChart3 />}>
      {!etf.ok ? <NotConfigured reason={etf.error} configured={!!etf.configured} /> : <EtfBody data={etf.data} />}
    </Panel>
  );
}

function NotConfigured({ reason, configured }: { reason: string; configured: boolean }) {
  return (
    <div className="grid gap-3 rounded-xl border border-dashed border-border/70 p-5 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <Info className="size-4 text-[#a888c0]" /> {configured ? "Dados indisponíveis" : "Fonte não configurada"}
      </p>
      <p className="text-muted-foreground">{reason}</p>
      {!configured && (
        <p className="text-xs text-muted-foreground">
          Não existe fonte gratuita e sem cadastro com os fluxos por ETF (a Farside bloqueia acesso automatizado). Com a chave da SoSoValue no servidor, esta seção mostra: fluxo
          do último dia, 7/30/90 dias, AUM agregado, gráfico de entradas e saídas com o acumulado, comparação por ETF (IBIT, FBTC, GBTC, ARKB e demais), tabela e leitura
          resumida. Nenhum número é mostrado sem a fonte.
        </p>
      )}
    </div>
  );
}

function EtfBody({ data }: { data: NonNullable<Extract<CryptoOverview["etf"], { ok: true }>["data"]> }) {
  const [win, setWin] = useState<Win>("30D");
  const [cmpWin, setCmpWin] = useState<Win>("30D");
  const [hidden, setHidden] = useState<string[]>([]);
  const valid = data.total.filter((r) => r.netInflow !== null);
  const last = valid.at(-1) ?? null;
  const lastAum = [...data.total].reverse().find((r) => r.netAssets !== null) ?? null;
  const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const days = WIN_DAYS[win];
  const lastT = last ? t(last.date) : 0;
  const shown = valid.filter((r) => t(r.date) >= lastT - (Math.max(days, 7) - 1) * 86_400_000);
  // Acumulado do período mostrado (começa em zero no início da janela).
  const cum = cumulative(shown.map((r): [number, number] => [t(r.date), r.netInflow as number]));
  const top = data.funds.slice(0, 4);
  const cmpDays = Math.max(WIN_DAYS[cmpWin], 7);
  const cmpSeries = useMemo(
    () =>
      data.funds
        .filter((f) => (data.byFund[f.ticker] ?? []).length)
        .slice(0, 8)
        .map((f, i) => {
          const pts = data.byFund[f.ticker];
          const end = pts.at(-1)![0];
          return { ticker: f.ticker, color: FUND_COLORS[i % FUND_COLORS.length], points: cumulative(pts.filter(([x]) => x >= end - (cmpDays - 1) * 86_400_000)) };
        }),
    [data, cmpDays],
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Card>
          <p className="text-xs text-muted-foreground">Fluxo líquido total</p>
          <p className={cn("text-lg font-semibold tabular-nums", tone(last?.netInflow ?? null))}>{usdCompact(last?.netInflow, true)}</p>
          <p className="text-[11px] text-muted-foreground">Última sessão ({last ? dateBr(t(last.date)) : "—"})</p>
        </Card>
        {top.map((f) => (
          <Card key={f.ticker}>
            <p className="text-xs text-muted-foreground">{f.ticker}</p>
            <p className={cn("text-lg font-semibold tabular-nums", tone(f.day))}>{usdCompact(f.day, true)}</p>
            <p className="text-[11px] text-muted-foreground">{f.lastDate ? dateBr(t(f.lastDate)) : "—"}</p>
          </Card>
        ))}
        <Card>
          <p className="text-xs text-muted-foreground">AUM agregado</p>
          <p className="text-lg font-semibold tabular-nums">{usdCompact(lastAum?.netAssets)}</p>
          <p className="text-[11px] text-muted-foreground">patrimônio (varia também com o preço)</p>
        </Card>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        {([7, 30, 90] as const).map((d) => {
          const v = flowSum(valid, d);
          return (
            <Card key={d}>
              <p className="text-xs text-muted-foreground">Fluxo {d} dias</p>
              <p className={cn("text-lg font-semibold tabular-nums", tone(v))}>{usdCompact(v, true)}</p>
            </Card>
          );
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Fluxo líquido dos ETFs de Bitcoin</h3>
            <Chips value={win} options={WINDOWS} onChange={setWin} label="Janela do fluxo agregado" />
          </div>
          <SeriesChart
            ariaLabel="Fluxo líquido diário e acumulado dos ETFs de Bitcoin"
            height={250}
            left={(v) => usdCompact(v)}
            right={(v) => usdCompact(v)}
            bars={{ points: shown.map((r) => [t(r.date), r.netInflow as number]), up: "#22c55e", down: "#ef4444", label: "Fluxo diário" }}
            lines={[{ points: cum, color: BTC_ORANGE, label: "Acumulado na janela", axis: "right" }]}
          />
          {win === "1D" && <p className="mt-1 text-[11px] text-muted-foreground">1D: valor da última sessão no cartão acima; o gráfico mostra a última semana para contexto.</p>}
        </Card>
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Fluxo por ETF (acumulado)</h3>
            <Chips value={cmpWin} options={WINDOWS} onChange={setCmpWin} label="Janela da comparação" />
          </div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {cmpSeries.map((s) => (
              <button
                key={s.ticker}
                type="button"
                aria-pressed={!hidden.includes(s.ticker)}
                onClick={() => setHidden((h) => (h.includes(s.ticker) ? h.filter((x) => x !== s.ticker) : [...h, s.ticker]))}
                className={cn("flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs", hidden.includes(s.ticker) && "opacity-40")}
              >
                <span className="size-2 rounded-full" style={{ background: s.color }} /> {s.ticker}
              </button>
            ))}
          </div>
          <SeriesChart
            ariaLabel="Fluxo acumulado por ETF"
            height={210}
            left={(v) => usdCompact(v)}
            refLine={0}
            lines={cmpSeries.filter((s) => !hidden.includes(s.ticker)).map((s) => ({ points: s.points, color: s.color, label: s.ticker }))}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Histórico por ETF: até 1 mês por consulta na fonte; os dias ficam guardados até completar 90.</p>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="overflow-x-auto p-0 sm:p-0">
          <h3 className="flex items-center gap-2 p-3 text-sm font-semibold">
            <Layers className="size-4 text-[#a888c0]" /> Principais ETFs de Bitcoin
          </h3>
          <table className="w-full min-w-[640px] text-sm" aria-label="ETFs de Bitcoin">
            <thead>
              <tr className="border-y text-xs text-muted-foreground">
                {["ETF", "Fluxo do dia", "Fluxo 7D", "Fluxo 30D", "Fluxo 90D", "AUM", "Tendência"].map((h, i) => (
                  <th key={h} className={cn("px-3 py-2 font-medium", i ? "text-right" : "text-left")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.funds.map((f) => (
                <tr key={f.ticker} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2">
                    <span className="block font-semibold">{f.ticker}</span>
                    <span className="block text-[11px] text-muted-foreground">{f.issuer || f.name}</span>
                  </td>
                  {[f.day, f.d7, f.d30, f.d90].map((v, i) => (
                    <td key={i} className={cn("px-3 py-2 text-right tabular-nums", tone(v))}>
                      {usdCompact(v, true)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums">{usdCompact(f.aum)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <span className="w-20">
                        <MiniArea points={f.spark} color={f.trend === "Saídas" ? "#ef4444" : "#22c55e"} height={24} />
                      </span>
                      <Badge tone={f.trend === "Entradas" ? "green" : f.trend === "Saídas" ? "red" : "gray"}>{f.trend}</Badge>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Interpretação</h3>
          <div className={cn("rounded-lg border p-3", data.reading.state === "Fluxo positivo" ? "border-green-500/40 bg-green-500/10" : data.reading.state === "Fluxo negativo" ? "border-red-500/40 bg-red-500/10" : "border-border bg-muted/30")}>
            <p className="font-semibold">{data.reading.state}</p>
          </div>
          <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            {data.reading.notes.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            Critério: soma de 7 dias acima de 25% do volume semanal típico = positivo/negativo; 7 e 30 dias com sinais trocados = misto. Fluxo líquido não é AUM nem valorização
            do BTC.
          </p>
        </Card>
      </div>
    </div>
  );
}
