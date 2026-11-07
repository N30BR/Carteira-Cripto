"use client";

// Gráfico de séries da aba Cripto (SVG): linhas/áreas, barras +/− e até dois eixos (esquerdo e direito).
// Séries com unidades diferentes ficam em eixos separados (nunca na mesma escala sem normalizar).
// Passar o mouse mostra a data e o valor real de cada série naquele dia.
import { useEffect, useMemo, useRef, useState } from "react";

export type Pt = [number, number];
export type Line = { points: Pt[]; color: string; label: string; area?: boolean; axis?: "left" | "right"; dashed?: boolean; width?: number };
export type Bars = { points: Pt[]; up: string; down: string; label: string; axis?: "left" | "right" };

const PAD = { top: 8, right: 8, bottom: 20, left: 8 };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
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

function ticks(min: number, max: number, n: number): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.round(v / step) * step || 0); // sem "-0"
  return out;
}

const dayFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" });
const fullFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

export function SeriesChart({
  lines = [],
  bars,
  height = 180,
  left = (v) => String(v),
  right,
  refLine,
  empty = "Dados indisponíveis",
  ariaLabel,
}: {
  lines?: Line[];
  bars?: Bars;
  height?: number;
  left?: (v: number) => string;
  right?: (v: number) => string;
  /** Linha tracejada de referência no eixo esquerdo (ex.: SOPR = 1, NUPL = 0). */
  refLine?: number;
  empty?: string;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const all = useMemo(() => [...lines.map((l) => ({ ...l, kind: "line" as const })), ...(bars ? [{ ...bars, kind: "bars" as const }] : [])], [lines, bars]);
  const has = all.some((s) => s.points.length > 0);
  const geo = useMemo(() => {
    if (!has) return null;
    const ts = all.flatMap((s) => s.points.map((p) => p[0]));
    const t0 = Math.min(...ts);
    const t1 = Math.max(...ts);
    const range = (axis: "left" | "right") => {
      const vs = all.filter((s) => (s.axis ?? "left") === axis).flatMap((s) => s.points.map((p) => p[1]));
      if (axis === "left" && refLine !== undefined) vs.push(refLine);
      if (bars && (bars.axis ?? "left") === axis) vs.push(0);
      if (!vs.length) return null;
      let lo = Math.min(...vs);
      let hi = Math.max(...vs);
      if (lo === hi) {
        lo -= Math.abs(lo) * 0.05 || 1;
        hi += Math.abs(hi) * 0.05 || 1;
      }
      const pad = (hi - lo) * 0.06;
      return { lo: lo - pad, hi: hi + pad };
    };
    return { t0, t1, L: range("left"), R: range("right") };
  }, [all, has, refLine, bars]);

  const labelW = 52;
  const plotL = PAD.left + labelW;
  const plotR = width - PAD.right - (right && geo?.R ? labelW : 0);
  const plotW = Math.max(10, plotR - plotL);
  const plotH = height - PAD.top - PAD.bottom;
  const x = (t: number) => (geo ? plotL + ((t - geo.t0) / (geo.t1 - geo.t0 || 1)) * plotW : 0);
  const y = (v: number, axis: "left" | "right" = "left") => {
    const r = axis === "right" ? geo?.R : geo?.L;
    if (!r) return 0;
    return PAD.top + (1 - (v - r.lo) / (r.hi - r.lo)) * plotH;
  };

  const xTicks = useMemo(() => {
    if (!geo) return [];
    const span = geo.t1 - geo.t0;
    const n = Math.max(2, Math.floor(plotW / 80));
    return Array.from({ length: n + 1 }, (_, i) => geo.t0 + (span * i) / n);
  }, [geo, plotW]);
  const longSpan = geo ? geo.t1 - geo.t0 > 120 * 86_400_000 : false;

  // Valor de cada série no dia sob o cursor (último ponto até a data, sem interpolar).
  const at = (pts: Pt[], t: number) => {
    let found: Pt | null = null;
    for (const p of pts) {
      if (p[0] <= t) found = p;
      else break;
    }
    return found;
  };

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {!has || !geo || width === 0 ? (
        <div className="grid h-full place-items-center text-xs text-muted-foreground">{has ? null : empty}</div>
      ) : (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGElement).getBoundingClientRect();
            const px = e.clientX - r.left;
            if (px < plotL || px > plotR) return setHover(null);
            setHover(geo.t0 + ((px - plotL) / plotW) * (geo.t1 - geo.t0));
          }}
          onMouseLeave={() => setHover(null)}
        >
          {geo.L &&
            ticks(geo.L.lo, geo.L.hi, 4).map((v) => (
              <g key={`l${v}`}>
                <line x1={plotL} x2={plotR} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-border" strokeDasharray="2 4" />
                <text x={plotL - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[10px]">
                  {left(v)}
                </text>
              </g>
            ))}
          {right &&
            geo.R &&
            ticks(geo.R.lo, geo.R.hi, 4).map((v) => (
              <text key={`r${v}`} x={plotR + 6} y={y(v, "right")} dominantBaseline="middle" className="fill-muted-foreground text-[10px]">
                {right(v)}
              </text>
            ))}
          {refLine !== undefined && geo.L && <line x1={plotL} x2={plotR} y1={y(refLine)} y2={y(refLine)} stroke="#a1a1aa" strokeDasharray="4 3" strokeWidth={1} />}
          {xTicks.map((t, i) => (
            <text key={i} x={x(t)} y={height - 4} textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"} className="fill-muted-foreground text-[10px]">
              {(longSpan ? monthFmt : dayFmt).format(t)}
            </text>
          ))}
          {bars &&
            (() => {
              const axis = bars.axis ?? "left";
              const n = bars.points.length;
              const bw = Math.max(1, Math.min(14, (plotW / Math.max(1, n)) * 0.7));
              const y0 = y(0, axis);
              return bars.points.map(([t, v]) => (
                <rect key={t} x={x(t) - bw / 2} y={Math.min(y0, y(v, axis))} width={bw} height={Math.max(1, Math.abs(y(v, axis) - y0))} fill={v >= 0 ? bars.up : bars.down} opacity={0.85} />
              ));
            })()}
          {lines.map((l) => {
            if (l.points.length < 1) return null;
            const axis = l.axis ?? "left";
            const d = l.points.map(([t, v], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(v, axis).toFixed(1)}`).join(" ");
            const base = PAD.top + plotH;
            return (
              <g key={l.label}>
                {l.area && l.points.length > 1 && <path d={`${d} L${x(l.points.at(-1)![0]).toFixed(1)},${base} L${x(l.points[0][0]).toFixed(1)},${base} Z`} fill={l.color} opacity={0.12} />}
                <path d={d} fill="none" stroke={l.color} strokeWidth={l.width ?? 1.6} strokeDasharray={l.dashed ? "4 3" : undefined} strokeLinejoin="round" />
              </g>
            );
          })}
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="#a1a1aa" strokeDasharray="2 3" pointerEvents="none" />
          )}
        </svg>
      )}
      {hover !== null && geo && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-md border bg-popover/95 px-2 py-1 text-[11px] shadow"
          style={x(hover) > width / 2 ? { right: width - x(hover) + 8 } : { left: x(hover) + 8 }}
        >
          <div className="text-muted-foreground">{fullFmt.format(hover)}</div>
          {all.map((s) => {
            const p = at(s.points, hover);
            if (!p) return null;
            const fmt = (s.axis ?? "left") === "right" && right ? right : left;
            return (
              <div key={s.label} className="flex items-center gap-1.5 tabular-nums">
                <span className="inline-block size-2 rounded-full" style={{ background: s.kind === "bars" ? (p[1] >= 0 ? s.up : s.down) : s.color }} />
                {s.label}: <strong>{fmt(p[1])}</strong>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Minigráfico simples (área), para cartões. */
export function MiniArea({ points, color, height = 56 }: { points: Pt[]; color: string; height?: number }) {
  if (points.length < 2) return <div style={{ height }} className="grid place-items-center text-[11px] text-muted-foreground">Histórico insuficiente</div>;
  const w = 200;
  const ys = points.map((p) => p[1]);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const t0 = points[0][0];
  const ts = points.at(-1)![0] - t0 || 1;
  const px = (t: number) => ((t - t0) / ts) * w;
  const py = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
  const d = points.map(([t, v], i) => `${i ? "L" : "M"}${px(t).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <path d={`${d} L${w},${height} L0,${height} Z`} fill={color} opacity={0.14} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
