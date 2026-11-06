"use client";

// Indicadores e ferramentas próprios registrados no KLineCharts (uma vez por página).
// Os cálculos ficam em lib/charts/indicators.ts (testados); aqui só a ligação com o gráfico.
import { registerIndicator, registerOverlay, type KLineData } from "klinecharts";
import { atr, ema, ichimoku, mfi, rsi, rsiDivergences, stochRsi, volumeProfile, vwap } from "@/lib/charts/indicators";

const UP = "#22c55e";
const DOWN = "#ef4444";
const ACCENT = "#8b7cf6";

let done = false;
type Row = Record<string, number | null>;
const bars = (d: KLineData[]) => d.map((b) => ({ ...b, volume: b.volume ?? 0 }));
const lines = (keys: string[], titles?: string[]) =>
  keys.map((key, i) => ({ key, title: `${titles?.[i] ?? key.toUpperCase()}: `, type: "line" }));

export function registerChartExtensions(): void {
  if (done) return;
  done = true;

  registerIndicator<Row, number>({
    name: "MA_RIBBON",
    shortName: "MA ribbon",
    series: "price",
    calcParams: [10, 30, 50, 100],
    precision: 2,
    shouldOhlc: true,
    regenerateFigures: (params) => params.map((p, i) => ({ key: `e${i}`, title: `EMA ${p}: `, type: "line" })),
    calc: (data, ind) => {
      const closes = data.map((b) => b.close);
      const cols = ind.calcParams.map((p) => ema(closes, p));
      return data.map((_, i) => Object.fromEntries(cols.map((c, j) => [`e${j}`, c[i]])));
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
    draw: ({ ctx, chart, indicator, xAxis, yAxis }) => {
      const data = chart.getDataList();
      const values = indicator.result as Row[];
      const divs = rsiDivergences(data.map((b) => b.close), indicator.calcParams[0], 3);
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

  // Volume Profile da faixa visível: barras horizontais à direita, POC e área de valor (70%).
  registerIndicator<Row, number>({
    name: "VOLUME_PROFILE",
    shortName: "Volume Profile",
    series: "price",
    calcParams: [24],
    figures: [],
    calc: (data) => data.map(() => ({})),
    draw: ({ ctx, chart, indicator, bounding, yAxis }) => {
      const data = chart.getDataList();
      const range = chart.getVisibleRange();
      const vp = volumeProfile(bars(data), range.from, range.to - 1, Math.max(4, Math.min(200, indicator.calcParams[0] || 24)));
      if (!vp.bins.length) return false;
      const max = Math.max(...vp.bins.map((b) => b.volume)) || 1;
      const width = bounding.width * 0.25;
      ctx.save();
      vp.bins.forEach((b, i) => {
        const yTop = yAxis.convertToPixel(b.to);
        const yBottom = yAxis.convertToPixel(b.from);
        const h = Math.max(1, Math.abs(yBottom - yTop) - 1);
        const w = (b.volume / max) * width;
        const inValue = b.from >= vp.valueArea.low && b.to <= vp.valueArea.high;
        ctx.fillStyle = i === vp.pocIndex ? `${ACCENT}cc` : inValue ? `${ACCENT}55` : "#71717a40";
        ctx.fillRect(bounding.width - w, Math.min(yTop, yBottom), w, h);
      });
      const poc = vp.bins[vp.pocIndex];
      const yPoc = yAxis.convertToPixel((poc.from + poc.to) / 2);
      ctx.strokeStyle = ACCENT;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, yPoc);
      ctx.lineTo(bounding.width, yPoc);
      ctx.stroke();
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
