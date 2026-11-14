"use client";

// CMC Crypto Fear and Greed Index: medidor atual, valores históricos (ontem, semana, mês), máximo e mínimo de 1 ano
// e gráfico histórico (índice 0–100, com preço e volume do BTC opcionais). Só dados da fonte: dia sem observação
// fica sem valor (nada interpolado). Filtros 30D/1A/Tudo independentes do período geral da página.
import { useEffect, useMemo, useRef, useState } from "react";
import { Gauge } from "lucide-react";
import type { FearGreedData } from "@/lib/market/data";
import { FG_RANGES, fgColor, fgReferences, fgWindow, fgYearRange, labelPt, type BtcDay, type FgPoint, type FgRange } from "@/lib/market/fear-greed";
import { cn } from "@/lib/utils";
import { Badge, Card, Chips, InfoTip, Panel, Unavailable, usd, usdCompact } from "./ui";

const DAY = 86_400_000;
const NO_FG: FgPoint[] = [];
const NO_BTC: BtcDay[] = [];
const dayFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const shortFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" });

// ---------- Medidor semicircular ----------
function FgGauge({ value }: { value: number }) {
  const W = 220;
  const R = 90;
  const cx = W / 2;
  const cy = 104;
  const pt = (v: number, r = R) => {
    const a = Math.PI * (1 - v / 100);
    // Arredondado: o mesmo texto no servidor e no navegador (senão a hidratação acusa diferença de casas decimais).
    return [Number((cx + r * Math.cos(a)).toFixed(2)), Number((cy - r * Math.sin(a)).toFixed(2))] as const;
  };
  // Arco em 50 trechos, cada um com a cor do seu valor (transição contínua).
  const segs = Array.from({ length: 50 }, (_, i) => {
    const [x1, y1] = pt(i * 2);
    const [x2, y2] = pt(i * 2 + 2.2);
    return <path key={i} d={`M${x1},${y1} A${R},${R} 0 0 1 ${x2},${y2}`} stroke={fgColor(i * 2 + 1)} strokeWidth={12} fill="none" strokeLinecap="butt" />;
  });
  const [mx, my] = pt(value);
  return (
    <svg viewBox={`0 0 ${W} 120`} className="mx-auto w-full max-w-[260px]" role="img" aria-label={`Medidor: ${value} de 100`}>
      <g opacity={0.9}>{segs}</g>
      <circle cx={mx} cy={my} r={9} fill="#0d0d10" stroke="#f4f4f5" strokeWidth={3} />
      <circle cx={mx} cy={my} r={4} fill={fgColor(value)} />
      <text x={cx - R} y={cy + 14} textAnchor="middle" className="fill-muted-foreground text-[9px]">
        0
      </text>
      <text x={cx + R} y={cy + 14} textAnchor="middle" className="fill-muted-foreground text-[9px]">
        100
      </text>
    </svg>
  );
}

function ValueRow({ title, point, note }: { title: string; point: FgPoint | null; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <span className="block text-xs text-muted-foreground">{title}</span>
        {point ? (
          <span className="text-sm font-medium" style={{ color: fgColor(point.value) }}>
            {labelPt(point.label)}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Sem observação</span>
        )}
        {note && <span className="block text-[11px] text-muted-foreground">{note}</span>}
      </div>
      {point && (
        <span className="grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums" style={{ background: `${fgColor(point.value).replace("rgb", "rgba").replace(")", ", 0.16)")}`, color: fgColor(point.value) }}>
          {point.value}
        </span>
      )}
    </div>
  );
}

// ---------- Gráfico histórico ----------
type Series = "fg" | "price" | "volume";
const SERIES_LABEL: Record<Series, string> = { fg: "Fear and Greed", price: "Preço BTC", volume: "Volume BTC" };

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceTicks(lo: number, hi: number, n: number) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(v);
  return out;
}

function FgChart({ fg, btc, on, height = 400 }: { fg: FgPoint[]; btc: BtcDay[]; on: Record<Series, boolean>; height?: number }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const btcByDay = useMemo(() => new Map(btc.map((b) => [b.t, b])), [btc]);
  const fgByDay = useMemo(() => new Map(fg.map((p) => [p.t, p])), [fg]);
  const showPrice = on.price && btc.length > 0;
  const showVol = on.volume && btc.length > 0;
  const t0 = Math.min(fg[0]?.t ?? Infinity, showPrice || showVol ? (btc[0]?.t ?? Infinity) : Infinity);
  const t1 = Math.max(fg.at(-1)?.t ?? -Infinity, showPrice || showVol ? (btc.at(-1)?.t ?? -Infinity) : -Infinity);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return <div className="grid h-[400px] place-items-center text-xs text-muted-foreground">Sem dados no período</div>;

  const padL = showPrice ? 84 : 12;
  const padR = 34;
  const top = 10;
  const volH = showVol ? Math.round(height * 0.18) : 0;
  const bottomAxis = 20;
  const mainH = height - top - bottomAxis - volH - (showVol ? 8 : 0);
  const plotW = Math.max(10, width - padL - padR);
  const x = (t: number) => padL + ((t - t0) / (t1 - t0 || 1)) * plotW;
  const yFg = (v: number) => top + (1 - v / 100) * mainH;
  const prices = btc.map((b) => b.close);
  const pLo = prices.length ? Math.min(...prices) : 0;
  const pHi = prices.length ? Math.max(...prices) : 1;
  const pPad = (pHi - pLo) * 0.06 || pHi * 0.05 || 1;
  const yP = (v: number) => top + (1 - (v - (pLo - pPad)) / (pHi + pPad - (pLo - pPad))) * mainH;
  const vMax = Math.max(1, ...btc.map((b) => b.volume));
  const volTop = top + mainH + 8;
  const yV = (v: number) => volTop + volH - (v / vMax) * volH;
  const longSpan = t1 - t0 > 120 * DAY;
  const nX = Math.max(2, Math.floor(plotW / 90));
  const xTicks = Array.from({ length: nX + 1 }, (_, i) => t0 + ((t1 - t0) * i) / nX);
  const day = hover === null ? null : Math.round(hover / DAY) * DAY;
  const hf = day === null ? null : (fgByDay.get(day) ?? null);
  const hb = day === null ? null : (btcByDay.get(day) ?? null);
  const barW = Math.max(1, Math.min(8, (plotW / Math.max(1, btc.length)) * 0.7));

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Histórico do Fear and Greed com preço e volume do BTC"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = e.clientX - r.left;
            setHover(px < padL || px > padL + plotW ? null : t0 + ((px - padL) / plotW) * (t1 - t0));
          }}
          onMouseLeave={() => setHover(null)}
        >
          {/* Faixas de referência do índice (0–100, eixo direito) */}
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1={padL} x2={padL + plotW} y1={yFg(v)} y2={yFg(v)} stroke="currentColor" className="text-border" strokeDasharray="2 4" />
              <text x={padL + plotW + 6} y={yFg(v)} dominantBaseline="middle" className="fill-muted-foreground text-[10px]">
                {v}
              </text>
            </g>
          ))}
          {showPrice &&
            niceTicks(pLo, pHi, 4).map((v) => (
              <text key={v} x={padL - 6} y={yP(v)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[10px]">
                {usdCompact(v)}
              </text>
            ))}
          {xTicks.map((t, i) => (
            <text key={i} x={x(t)} y={height - 4} textAnchor={i === 0 ? "start" : i === nX ? "end" : "middle"} className="fill-muted-foreground text-[10px]">
              {(longSpan ? monthFmt : shortFmt).format(t)}
            </text>
          ))}
          {showVol && (
            <g>
              {btc.map((b) => (
                <rect key={b.t} x={x(b.t) - barW / 2} y={yV(b.volume)} width={barW} height={Math.max(0.5, volTop + volH - yV(b.volume))} fill="#71717a" opacity={0.45} />
              ))}
              <text x={padL + 4} y={volTop + 9} className="fill-muted-foreground text-[9px]">
                Volume (US$)
              </text>
            </g>
          )}
          {showPrice && (
            <path
              d={btc.map((b, i) => `${i ? "L" : "M"}${x(b.t).toFixed(1)},${yP(b.close).toFixed(1)}`).join(" ")}
              fill="none"
              stroke="#d4d4d8"
              strokeOpacity={0.8}
              strokeWidth={1.3}
            />
          )}
          {on.fg &&
            fg.slice(1).map((p, i) => {
              const a = fg[i];
              // Lacuna de mais de 2 dias na fonte: sem linha (nada inventado).
              if (p.t - a.t > 2 * DAY) return null;
              return <line key={p.t} x1={x(a.t)} y1={yFg(a.value)} x2={x(p.t)} y2={yFg(p.value)} stroke={fgColor((a.value + p.value) / 2)} strokeWidth={1.8} strokeLinecap="round" />;
            })}
          {hover !== null && day !== null && (
            <g pointerEvents="none">
              <line x1={x(day)} x2={x(day)} y1={top} y2={height - bottomAxis} stroke="#a1a1aa" strokeDasharray="2 3" />
              {on.fg && hf && <circle cx={x(day)} cy={yFg(hf.value)} r={3.5} fill={fgColor(hf.value)} stroke="#0d0d10" />}
              {showPrice && hb && <circle cx={x(day)} cy={yP(hb.close)} r={3} fill="#d4d4d8" stroke="#0d0d10" />}
            </g>
          )}
        </svg>
      )}
      {hover !== null && day !== null && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-1 z-10 min-w-40 rounded-md border bg-popover/95 px-2.5 py-1.5 text-[11px] shadow"
          style={x(day) > width / 2 ? { right: width - x(day) + 10 } : { left: x(day) + 10 }}
        >
          <div className="mb-0.5 text-muted-foreground">{dayFmt.format(day)} (UTC)</div>
          {on.fg && (
            <div className="tabular-nums">
              Fear and Greed:{" "}
              {hf ? (
                <strong style={{ color: fgColor(hf.value) }}>
                  {hf.value} · {labelPt(hf.label)}
                </strong>
              ) : (
                <span className="text-muted-foreground">sem observação</span>
              )}
            </div>
          )}
          {on.price && (
            <div className="tabular-nums">
              Preço BTC: {hb ? <strong>{usd(hb.close, 0)}</strong> : <span className="text-muted-foreground">sem dado</span>}
            </div>
          )}
          {on.volume && (
            <div className="tabular-nums">
              Volume BTC: {hb ? <strong>{usdCompact(hb.volume)}</strong> : <span className="text-muted-foreground">sem dado</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Seção ----------
export function FearGreedSection({ data, now, timeZone }: { data: FearGreedData; now: number; timeZone: string }) {
  const [range, setRange] = useState<FgRange>("1A");
  const [on, setOn] = useState<Record<Series, boolean>>({ fg: true, price: false, volume: false });
  const history = data.history.ok ? data.history.data : NO_FG;
  const btc = data.btc.ok ? data.btc.data : NO_BTC;
  const latest = data.latest.ok ? data.latest.data : null;
  const lastT = history.at(-1)?.t ?? now;
  const fgView = useMemo(() => fgWindow(history, range, lastT), [history, range, lastT]);
  const btcView = useMemo(() => fgWindow(btc, range, lastT).filter((b) => b.t <= lastT + DAY), [btc, range, lastT]);
  const refs = useMemo(() => fgReferences(history, now), [history, now]);
  const year = useMemo(() => fgYearRange(history), [history]);
  const when = (t: number) => new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(t);
  const stale = (data.latest.ok && data.latest.stale) || (data.history.ok && data.history.stale);

  return (
    <Panel
      id="fear-greed"
      title="Crypto Fear and Greed Index"
      subtitle="Índice de Medo e Ganância do mercado cripto (CoinMarketCap), de 0 (medo extremo) a 100 (ganância extrema)."
      icon={<Gauge />}
      right={<Chips label="Período do Fear and Greed" value={range} options={FG_RANGES} onChange={setRange} />}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_minmax(0,2.4fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            {latest ? (
              <div className="flex flex-col items-center gap-1 text-center">
                <FgGauge value={latest.value} />
                <span className="-mt-8 text-4xl font-semibold tabular-nums" data-testid="fg-value">
                  {latest.value}
                </span>
                <span className="text-sm font-medium" style={{ color: fgColor(latest.value) }} data-testid="fg-label">
                  {labelPt(latest.label)}
                </span>
                <span className="mt-1 text-[11px] text-muted-foreground">
                  Atualizado em {when(latest.updatedAt)} · Fonte: CoinMarketCap
                </span>
                {data.latest.ok && data.latest.stale && <Badge tone="amber">Desatualizado: a fonte não respondeu; último valor válido</Badge>}
              </div>
            ) : (
              <Unavailable reason={data.latest.ok ? "" : `${data.latest.error} (valor atual).`} className="h-48" />
            )}
          </Card>
          <Card>
            <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
              Valores históricos
              <InfoTip text="Observação da CoinMarketCap no dia de referência (UTC), não média do período. Sem observação naquele dia, vale a anterior mais próxima, com a data indicada." />
            </h3>
            {data.history.ok ? (
              <div className="divide-y divide-border/60">
                {refs.map((r) => (
                  <ValueRow key={r.key} title={r.title} point={r.point} note={r.point && !r.exact ? `Observação de ${dayFmt.format(r.point.t)}` : undefined} />
                ))}
              </div>
            ) : (
              <Unavailable reason={`${data.history.error}.`} className="h-28" />
            )}
          </Card>
          <Card>
            <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
              Máximo e mínimo anual
              <InfoTip text="Últimos 12 meses até a observação mais recente (não o ano civil)." />
            </h3>
            {year ? (
              <div className="divide-y divide-border/60">
                <ValueRow title={`Máximo de 1 ano · ${dayFmt.format(year.max.t)}`} point={year.max} />
                <ValueRow title={`Mínimo de 1 ano · ${dayFmt.format(year.min.t)}`} point={year.min} />
              </div>
            ) : (
              <Unavailable reason="Histórico indisponível." className="h-28" />
            )}
          </Card>
        </div>
        <Card className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div role="group" aria-label="Séries do gráfico" className="flex flex-wrap gap-1.5">
              {(Object.keys(SERIES_LABEL) as Series[]).map((s) => {
                const disabled = s === "fg" ? !data.history.ok : !data.btc.ok;
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on[s]}
                    disabled={disabled}
                    onClick={() => setOn((o) => ({ ...o, [s]: !o[s] }))}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      on[s] ? "border-[#8b7cf6]/60 bg-[#8b7cf6]/15 text-foreground" : "border-border/70 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ background: s === "fg" ? "linear-gradient(90deg,#e5484d,#e5c53a,#2fb36f)" : s === "price" ? "#d4d4d8" : "#71717a" }}
                    />
                    {SERIES_LABEL[s]}
                  </button>
                );
              })}
            </div>
            {stale && <Badge tone="amber">Dados desatualizados</Badge>}
          </div>
          {data.history.ok || data.btc.ok ? (
            <FgChart fg={on.fg ? fgView : []} btc={btcView} on={on} />
          ) : (
            <Unavailable reason={`${data.history.ok ? "" : data.history.error}.`} className="h-[400px]" />
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Fear and Greed: CoinMarketCap (diário, UTC; eixo direito, 0–100).
            {data.btc.ok
              ? " Preço (eixo esquerdo) e volume do BTC: Binance, par BTC/USDT, diário — volume em USDT negociado na Binance, não o de todo o mercado; o dia de hoje ainda é parcial."
              : ` Preço e volume do BTC indisponíveis: ${data.btc.error}.`}
            {!data.history.ok && ` Histórico do índice indisponível: ${data.history.error}.`}
          </p>
        </Card>
      </div>
    </Panel>
  );
}
