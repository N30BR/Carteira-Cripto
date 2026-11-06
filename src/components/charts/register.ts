"use client";

// Indicadores e ferramentas próprios registrados no KLineCharts (uma vez por página).
// Os cálculos ficam em lib/charts/indicators.ts (testados); aqui só a ligação com o gráfico.
import { registerIndicator, registerOverlay, type KLineData } from "klinecharts";
import {
  atr,
  deltaSeries,
  ichimoku,
  liquidationLevels,
  mfi,
  movingAverage,
  priceSource,
  rsi,
  rsiDivergences,
  stochRsi,
  volumeProfile,
  vwap,
  type MaMethod,
  type Source,
} from "@/lib/charts/indicators";
import { drawProfile, PROFILE_BUY, PROFILE_SELL } from "./profile";
import { registerOverlaysAndAxes } from "./overlays";
import { alignStep, rebase, type Point } from "@/lib/charts/macro-math";

const UP = "#22c55e";
const DOWN = "#ef4444";
const ACCENT = "#8b7cf6";

let done = false;
type Row = Record<string, number | null>;
const bars = (d: KLineData[]) => d.map((b) => ({ ...b, volume: b.volume ?? 0 }));
const lines = (keys: string[], titles?: string[]) =>
  keys.map((key, i) => ({ key, title: `${titles?.[i] ?? key.toUpperCase()}: `, type: "line" }));

import { COMPARE_COLORS } from "@/lib/charts/colors";
export { COMPARE_COLORS };
export type CompareData = { label: string; points: Point[]; color: string };

/** Chave que muda quando as velas mudam (para não recalcular a cada movimento do mouse). */
const dataKey = (d: KLineData[]) => (d.length ? `${d.length}:${d[0].timestamp}:${d[d.length - 1].timestamp}:${d[d.length - 1].close}` : "0");

/** Série encaixada na faixa do preço (mín./máx. no período em que as duas existem); nulos continuam nulos. */
function fitToPrice(values: (number | null)[], data: KLineData[]): (number | null)[] {
  let vMin = Infinity;
  let vMax = -Infinity;
  let pMin = Infinity;
  let pMax = -Infinity;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) return;
    vMin = Math.min(vMin, v);
    vMax = Math.max(vMax, v);
    pMin = Math.min(pMin, data[i].low);
    pMax = Math.max(pMax, data[i].high);
  });
  if (!Number.isFinite(vMin) || !Number.isFinite(pMin)) return values.map(() => null);
  const span = vMax - vMin || 1;
  return values.map((v) => (v === null ? null : pMin + ((v - vMin) / span) * (pMax - pMin)));
}

export function registerChartExtensions(): void {
  registerOverlaysAndAxes();
  if (done) return;
  done = true;

  // Comparações: uma "vaga" por comparação (o gráfico não aceita dois indicadores com o mesmo nome no mesmo painel).
  for (let slot = 0; slot < COMPARE_COLORS.length; slot++) {
    // Na janela do preço: rebase (começa no preço e segue as próprias variações).
    registerIndicator<Row, number, CompareData>({
      name: `COMPARE_${slot}`,
      shortName: "Comparar",
      series: "price",
      precision: 2,
      figures: [{ key: "v", title: "", type: "line" }],
      calc: (data, ind) => {
        const pts = ind.extendData?.points ?? [];
        const aligned = alignStep(pts, data.map((b) => b.timestamp));
        return rebase(aligned, data.map((b) => b.close)).map((v) => ({ v }));
      },
    });
    // Na janela do preço sem rebase: mesma unidade do preço (ex.: preço realizado do BTC em US$).
    registerIndicator<Row, number, CompareData>({
      name: `RAW_${slot}`,
      shortName: "Comparar",
      series: "price",
      precision: 2,
      figures: [{ key: "v", title: "", type: "line" }],
      calc: (data, ind) => alignStep(ind.extendData?.points ?? [], data.map((b) => b.timestamp)).map((v) => ({ v })),
    });
    // Na janela do preço com escala própria: a série é encaixada na faixa do preço (mínimo/máximo do período
    // em comum), sem rebase — serve para unidades diferentes do preço e para valores negativos ou zero.
    registerIndicator<Row, number, CompareData>({
      name: `FIT_${slot}`,
      shortName: "Comparar",
      series: "price",
      precision: 2,
      figures: [{ key: "v", title: "", type: "line" }],
      calc: (data, ind) => fitToPrice(alignStep(ind.extendData?.points ?? [], data.map((b) => b.timestamp)), data).map((v) => ({ v })),
    });
    // Em painel próprio: o valor real (ex.: juros em %).
    registerIndicator<Row, number, CompareData>({
      name: `MACRO_${slot}`,
      shortName: "Macro",
      precision: 2,
      figures: [{ key: "v", title: "", type: "line" }],
      calc: (data, ind) => alignStep(ind.extendData?.points ?? [], data.map((b) => b.timestamp)).map((v) => ({ v })),
    });
  }

  // MA ribbon: cada linha pode ser EMA, SMA, WMA ou RMA (extendData.types).
  registerIndicator<Row, number, { types?: string[]; source?: Source }>({
    name: "MA_RIBBON",
    shortName: "MA ribbon",
    series: "price",
    calcParams: [10, 30, 50, 100],
    precision: 2,
    shouldOhlc: true,
    regenerateFigures: (params) => params.map((p, i) => ({ key: `e${i}`, title: `MA ${p}: `, type: "line" })),
    calc: (data, ind) => {
      const values = priceSource(data, ind.extendData?.source);
      const types = ind.extendData?.types ?? [];
      const cols = ind.calcParams.map((p, j) => movingAverage(values, p, (types[j] as MaMethod | undefined) ?? "EMA"));
      return data.map((_, i) => Object.fromEntries(cols.map((c, j) => [`e${j}`, c[i]])));
    },
  });

  // MA Ribbon NEO: oito médias numa única instância (padrão: SMA 25, 30, 35, 40, 45, 50, 100 e 200 no fechamento,
  // como "MA 25 close 0" das referências). Cores e traços padrão ficam em NEO_SERIES (chart-pane).
  registerIndicator<Row, number, { types?: string[]; source?: Source }>({
    name: "MA_RIBBON_NEO",
    shortName: "MA Ribbon NEO",
    series: "price",
    calcParams: [25, 30, 35, 40, 45, 50, 100, 200],
    precision: 2,
    shouldOhlc: true,
    regenerateFigures: (params) => params.map((p, i) => ({ key: `m${i}`, title: `MA ${p}: `, type: "line" })),
    calc: (data, ind) => {
      const values = priceSource(data, ind.extendData?.source);
      const types = ind.extendData?.types ?? [];
      const cols = ind.calcParams.map((p, j) => movingAverage(values, p, (types[j] as MaMethod | undefined) ?? "SMA"));
      return data.map((_, i) => Object.fromEntries(cols.map((c, j) => [`m${j}`, c[i]])));
    },
  });

  registerIndicator<Row>({
    name: "VWAP",
    shortName: "VWAP",
    series: "price",
    precision: 2,
    figures: lines(["vwap"], ["VWAP"]),
    calc: (data) => vwap(bars(data)).map((v) => ({ vwap: v })),
  });

  registerIndicator<Row, number>({
    name: "ICHIMOKU",
    shortName: "Ichimoku",
    series: "price",
    calcParams: [9, 26, 52],
    precision: 2,
    figures: lines(["tenkan", "kijun", "spanA", "spanB", "chikou"], ["Tenkan", "Kijun", "Span A", "Span B", "Chikou"]),
    calc: (data, ind) => {
      const [t, k, b] = ind.calcParams;
      const r = ichimoku(bars(data), t, k, b);
      // Nuvem deslocada k velas para a frente; chikou k velas para trás.
      return r.map((_, i) => ({
        tenkan: r[i].tenkan,
        kijun: r[i].kijun,
        spanA: i >= k ? r[i - k].senkouA : null,
        spanB: i >= k ? r[i - k].senkouB : null,
        chikou: i + k < r.length ? r[i + k].chikou : null,
      }));
    },
  });

  registerIndicator<Row, number>({
    name: "STOCH_RSI",
    shortName: "Stoch RSI",
    calcParams: [14, 14, 3, 3],
    precision: 2,
    minValue: 0,
    maxValue: 100,
    figures: lines(["k", "d"], ["%K", "%D"]),
    calc: (data, ind) => {
      const [r, s, k, d] = ind.calcParams;
      const out = stochRsi(data.map((b) => b.close), r, s, k, d);
      return data.map((_, i) => ({ k: out.k[i], d: out.d[i] }));
    },
  });

  registerIndicator<Row, number>({
    name: "ATR",
    shortName: "ATR",
    calcParams: [14],
    precision: 4,
    figures: lines(["atr"], ["ATR"]),
    calc: (data, ind) => atr(bars(data), ind.calcParams[0]).map((v) => ({ atr: v })),
  });

  registerIndicator<Row, number>({
    name: "MFI",
    shortName: "MFI",
    calcParams: [14],
    precision: 2,
    minValue: 0,
    maxValue: 100,
    figures: lines(["mfi"], ["MFI"]),
    calc: (data, ind) => mfi(bars(data), ind.calcParams[0]).map((v) => ({ mfi: v })),
  });

  const divMemo = new Map<string, { key: string; divs: ReturnType<typeof rsiDivergences> }>();
  // RSI com as divergências desenhadas (linhas e etiquetas "Bull"/"Bear").
  registerIndicator<Row, number>({
    name: "RSI_DIV",
    shortName: "RSI divergência",
    calcParams: [14],
    precision: 2,
    minValue: 0,
    maxValue: 100,
    figures: lines(["rsi"], ["RSI"]),
    calc: (data, ind) => rsi(data.map((b) => b.close), ind.calcParams[0]).map((v) => ({ rsi: v })),
    draw: ({ ctx, chart, indicator, bounding, xAxis, yAxis }) => {
      if (!indicator.visible) return false;
      const data = chart.getDataList();
      const values = indicator.result as Row[];
      // As divergências só mudam com as velas ou o período: recalcula só nesses casos.
      const key = `${dataKey(data)}:${indicator.calcParams[0]}`;
      let memo = divMemo.get(indicator.id);
      if (!memo || memo.key !== key) {
        memo = { key, divs: rsiDivergences(data.map((b) => b.close), indicator.calcParams[0], 3) };
        divMemo.set(indicator.id, memo);
      }
      const range = chart.getVisibleRange();
      const divs = memo.divs.filter((d) => d.to >= range.from && d.from <= range.to);
      // Níveis de referência (padrão 30/50/70).
      const levels = (indicator.extendData as { levels?: number[] } | undefined)?.levels ?? [30, 50, 70];
      ctx.save();
      ctx.strokeStyle = "#71717a";
      ctx.setLineDash([4, 4]);
      for (const l of levels) {
        const y = Math.round(yAxis.convertToPixel(l)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(bounding.width, y);
        ctx.stroke();
      }
      ctx.restore();
      ctx.save();
      ctx.font = "11px sans-serif";
      for (const d of divs) {
        const a = values[d.from]?.rsi;
        const b = values[d.to]?.rsi;
        if (a == null || b == null) continue;
        const x1 = xAxis.convertToPixel(d.from);
        const x2 = xAxis.convertToPixel(d.to);
        const y1 = yAxis.convertToPixel(a);
        const y2 = yAxis.convertToPixel(b);
        const color = d.kind === "bull" ? UP : DOWN;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        const label = d.kind === "bull" ? "Bull" : "Bear";
        const w = ctx.measureText(label).width + 8;
        ctx.fillStyle = color;
        ctx.fillRect(x2 - w / 2, y2 + (d.kind === "bull" ? 6 : -22), w, 16);
        ctx.fillStyle = "#fff";
        ctx.fillText(label, x2 - w / 2 + 4, y2 + (d.kind === "bull" ? 18 : -10));
      }
      ctx.restore();
      return false;
    },
  });

  const vpMemo = new Map<string, { key: string; vp: ReturnType<typeof volumeProfile> }>();
  // Volume Profile da faixa visível (estimado: volume repartido entre mínima e máxima de cada vela): POC e área de valor (70%),
  // cada faixa dividida em compras (verde) e vendas (vermelho), no modelo "Volume Profile and Volume Indicator by DGT".
  registerIndicator<Row, number, { upColor?: string; downColor?: string }>({
    name: "VOLUME_PROFILE",
    shortName: "Volume Profile",
    series: "price",
    calcParams: [24, 70],
    figures: [],
    calc: (data) => data.map(() => ({})),
    draw: ({ ctx, chart, indicator, bounding, yAxis }) => {
      if (!indicator.visible) return false;
      const data = chart.getDataList();
      const range = chart.getVisibleRange();
      // Recalcula só quando as velas ou a faixa visível mudam (não a cada movimento do mouse).
      const rows = Math.max(4, Math.min(200, indicator.calcParams[0] || 24));
      const key = `${dataKey(data)}:${range.from}:${range.to}:${rows}:${indicator.calcParams[1] ?? 70}`;
      let memo = vpMemo.get(indicator.id);
      if (!memo || memo.key !== key) {
        memo = { key, vp: volumeProfile(bars(data), range.from, range.to - 1, rows, Math.max(10, Math.min(100, indicator.calcParams[1] ?? 70)) / 100) };
        vpMemo.set(indicator.id, memo);
      }
      // Âncora à direita (as barras crescem para a esquerda); à direita dela, o perfil de sentimento.
      const sentiment = Math.max(16, bounding.width * 0.05);
      drawProfile(ctx, memo.vp, {
        anchorX: bounding.width - sentiment - 6,
        width: bounding.width * 0.22,
        sentiment,
        lineFrom: 0,
        lineTo: bounding.width,
        y: (p) => yAxis.convertToPixel(p),
        buyColor: indicator.extendData?.upColor ?? PROFILE_BUY,
        sellColor: indicator.extendData?.downColor ?? PROFILE_SELL,
      });
      return false;
    },
  });

  // Volume Delta por vela (compras − vendas agressoras; volume comprador real da Binance por vela):
  // colunas verdes/vermelhas ou linha (extendData.mode), cores configuráveis.
  registerIndicator<Row, number, { upColor?: string; downColor?: string; mode?: "columns" | "line" }>({
    name: "DELTA",
    shortName: "Volume Delta",
    precision: 2,
    shouldFormatBigNumber: true,
    figures: [
      {
        key: "delta",
        title: "Delta: ",
        type: "bar",
        baseValue: 0,
        styles: ({ data, indicator }) => {
          const v = data.current?.delta ?? 0;
          const x = indicator.extendData as { upColor?: string; downColor?: string } | undefined;
          return { color: (v ?? 0) >= 0 ? (x?.upColor ?? UP) : (x?.downColor ?? DOWN) };
        },
      },
      { key: "deltaLine", title: "Delta (linha): ", type: "line" },
    ],
    calc: (data, ind) => {
      const line = ind.extendData?.mode === "line";
      return deltaSeries(data as never).delta.map((d) => (line ? { delta: null, deltaLine: d } : { delta: d, deltaLine: null }));
    },
  });

  // CVD: delta acumulado.
  registerIndicator<Row>({
    name: "CVD",
    shortName: "CVD",
    precision: 2,
    shouldFormatBigNumber: true,
    figures: lines(["cvd"], ["CVD"]),
    calc: (data) => deltaSeries(data as never).cvd.map((cvd) => ({ cvd })),
  });

  const liqMemo = new Map<string, { key: string; oi: unknown; levels: ReturnType<typeof liquidationLevels>; max: number }>();
  // Heatmap de liquidações ESTIMADO (open interest da Binance Futures + faixas de alavancagem).
  registerIndicator<Row, number, { oi: [number, number][]; note?: string }>({
    name: "LIQ_HEATMAP",
    shortName: "Liquidações (estimado)",
    series: "price",
    figures: [],
    calc: (data) => data.map(() => ({})),
    draw: ({ ctx, chart, indicator, bounding, xAxis, yAxis }) => {
      if (!indicator.visible) return false;
      const data = chart.getDataList();
      const oi = indicator.extendData?.oi ?? [];
      if (!oi.length || !data.length) return false;
      // Recalcula só quando as velas ou o open interest mudam (não a cada movimento do mouse).
      const memoKey = `${data.length}:${data[0].timestamp}:${data[data.length - 1].timestamp}:${data[data.length - 1].close}`;
      let memo = liqMemo.get(indicator.id);
      if (!memo || memo.key !== memoKey || memo.oi !== oi) {
        const levels = liquidationLevels(bars(data), oi);
        memo = { key: memoKey, oi, levels, max: levels.reduce((m, l) => Math.max(m, l.notional), 0) || 1 };
        liqMemo.set(indicator.id, memo);
      }
      const { levels, max } = memo;
      const range = chart.getVisibleRange();
      ctx.save();
      for (const l of levels) {
        const end = l.to ?? data.length + 5;
        if (end < range.from || l.from > range.to) continue;
        const x1 = xAxis.convertToPixel(l.from);
        const x2 = Math.min(bounding.width, xAxis.convertToPixel(end));
        const y = yAxis.convertToPixel(l.price);
        if (y < 0 || y > bounding.height) continue;
        const alpha = 0.12 + 0.75 * Math.sqrt(l.notional / max);
        ctx.fillStyle = l.to === null ? `rgba(250, 204, 21, ${alpha})` : `rgba(139, 124, 246, ${alpha * 0.5})`;
        ctx.fillRect(x1, y - 1.5, Math.max(1, x2 - x1), 3);
      }
      ctx.fillStyle = "#a1a1aa";
      ctx.font = "11px Geist, sans-serif";
      ctx.fillText("Liquidações estimadas (OI Binance Futures, até 30 dias)", 8, bounding.height - 8);
      ctx.restore();
      return false;
    },
  });

  // Retângulo (2 pontos).
  registerOverlay({
    name: "rectangle",
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    styles: { polygon: { color: `${ACCENT}26`, borderColor: ACCENT } },
    createPointFigures: ({ coordinates }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      return [
        {
          type: "polygon",
          attrs: { coordinates: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }] },
          styles: { style: "stroke_fill" },
        },
      ];
    },
  });

  // Medir: diferença de preço e % entre dois pontos.
  registerOverlay({
    name: "measure",
    totalStep: 3,
    needDefaultPointFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      const [p1, p2] = overlay.points;
      const v1 = p1?.value ?? 0;
      const v2 = p2?.value ?? 0;
      const diff = v2 - v1;
      const pct = v1 ? (diff / v1) * 100 : 0;
      const up = diff >= 0;
      const color = up ? UP : DOWN;
      return [
        {
          type: "polygon",
          attrs: { coordinates: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }] },
          styles: { style: "fill", color: `${color}26` },
        },
        {
          type: "text",
          attrs: { x: (a.x + b.x) / 2, y: b.y + (up ? -6 : 6), text: `${up ? "+" : ""}${diff.toPrecision(6)} (${up ? "+" : ""}${pct.toFixed(2)}%)`, align: "center", baseline: up ? "bottom" : "top" },
          styles: { color: "#fff", backgroundColor: color, borderRadius: 4, paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3, size: 12 },
        },
      ];
    },
  });

}
