"use client";

// Eixo logarítmico próprio e ferramentas de desenho próprias (registrados uma vez por página).
// As regras (níveis do Fibonacci, faixa em log) ficam em lib/charts e são testadas sem navegador.
import { registerOverlay, registerYAxis, type KLineData, type OverlayFigure } from "klinecharts";
import { DEFAULT_FIB_LEVELS, fibPrice, findBarIndex } from "@/lib/charts/drawing";
import { anchoredVwap, volumeProfile } from "@/lib/charts/indicators";
import { fromLog, logRange, logTickValues, toLog, type AxisRange } from "@/lib/charts/log-axis";
import type { ExtendName, FibLevel } from "@/lib/charts/workspace";

const ACCENT = "#8b7cf6";
export const LOG_AXIS = "log10";

/** Dados extras de um desenho (o texto das anotações continua sendo uma string). */
export type OverlayExtra = { extend?: ExtendName; levels?: FibLevel[]; rows?: number; valueArea?: number };
const extra = (v: unknown): OverlayExtra => (typeof v === "object" && v !== null ? (v as OverlayExtra) : {});

const fmt = (v: number) => {
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : Math.min(10, Math.ceil(-Math.log10(abs || 1)) + 4);
  return v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits });
};

type AxisSelf = { _range: AxisRange; _autoCalcTickFlag: boolean };

let done = false;
export function registerOverlaysAndAxes(): void {
  if (done) return;
  done = true;

  // ---------- Eixo logarítmico (log10 do preço) ----------
  // A biblioteca desloca from/to linearmente ao arrastar e ao esticar o eixo: aqui eles valem em log,
  // então arrastar só desloca (a proporção entre os preços não muda) e esticar dá zoom geométrico.
  registerYAxis({
    name: LOG_AXIS,
    minSpan: () => 1e-4,
    valueToRealValue: (v: number) => toLog(v),
    realValueToValue: (r: number) => fromLog(r),
    realValueToDisplayValue: (r: number) => fromLog(r),
    displayValueToRealValue: (v: number) => toLog(v),
    createRange: ({ defaultRange }: { defaultRange: AxisRange }) => {
      const r = logRange(toLog(defaultRange.from), toLog(defaultRange.to));
      return { ...r, from: defaultRange.from, to: defaultRange.to, range: defaultRange.range };
    },
    // Quem pede a faixa (arrastar, esticar) recebe from/to em log.
    getRange(this: AxisSelf) {
      const r = this._range;
      return r ? logRange(r.realFrom, r.realTo) : r;
    },
    // E o que volta (from/to em log) vira a faixa completa, coerente.
    setRange(this: AxisSelf, r: AxisRange) {
      this._autoCalcTickFlag = false;
      this._range = logRange(r.from, r.to);
    },
    // Marcações por década (1, 2, 5 × 10ⁿ) quando a faixa é grande; senão, as normais.
    createTicks: ({ range, bounding, defaultTicks }: { range: AxisRange; bounding: { height: number }; defaultTicks: { coord: number; value: number | string; text: string }[] }) => {
      if (range.displayTo / Math.max(range.displayFrom, 1e-12) < 4) return defaultTicks;
      const h = bounding.height;
      const ticks: { coord: number; value: number; text: string }[] = [];
      let lastY = Infinity;
      for (const v of logTickValues(range.displayFrom, range.displayTo)) {
        const y = Math.round((1 - (toLog(v) - range.realFrom) / range.realRange) * h);
        if (y < 12 || y > h - 12 || Math.abs(lastY - y) < 28) continue;
        ticks.push({ coord: y, value: v, text: fmt(v) });
        lastY = y;
      }
      return ticks.length >= 2 ? ticks : defaultTicks;
    },
  } as never);

  // ---------- Linha de tendência com extensão (não estende / esquerda / direita / ambos) ----------
  registerOverlay({
    name: "segment",
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      const ext = extra(overlay.extendData).extend ?? "none";
      if (ext === "none" || a.x === b.x) return [{ type: "line", attrs: { coordinates: [a, b] } }];
      const slope = (b.y - a.y) / (b.x - a.x);
      const at = (x: number) => ({ x, y: a.y + slope * (x - a.x) });
      const [left, right] = a.x < b.x ? [a, b] : [b, a];
      const from = ext === "left" || ext === "both" ? at(0) : left;
      const to = ext === "right" || ext === "both" ? at(bounding.width) : right;
      return [{ type: "line", attrs: { coordinates: [from, to] } }];
    },
  });

  // ---------- Retração de Fibonacci: 1º clique = nível 1, 2º clique = nível 0 ----------
  registerOverlay({
    name: "fibonacciLine",
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay, yAxis }) => {
      const [p1, p2] = overlay.points;
      if (coordinates.length < 2 || typeof p1?.value !== "number" || typeof p2?.value !== "number" || !yAxis) return [];
      const levels = (extra(overlay.extendData).levels ?? DEFAULT_FIB_LEVELS).filter((l) => l.visible);
      const x1 = Math.min(coordinates[0].x, coordinates[1].x);
      const x2 = Math.max(coordinates[0].x, coordinates[1].x);
      const size = (overlay.styles?.line as { size?: number } | undefined)?.size ?? 1;
      const figures: OverlayFigure[] = [
        // Linha tracejada ligando os dois cliques.
        { type: "line", attrs: { coordinates: [coordinates[0], coordinates[1]] }, styles: { style: "dashed", dashedValue: [4, 4], color: "#a1a1aa" }, ignoreEvent: true },
      ];
      for (const l of levels) {
        const price = fibPrice(p1.value, p2.value, l.value);
        const y = yAxis.convertToPixel(price);
        figures.push({ type: "line", attrs: { coordinates: [{ x: x1, y }, { x: x2, y }] }, styles: { color: l.color, size } });
        figures.push({
          type: "text",
          attrs: { x: x1 - 4, y, text: `${l.value} (${fmt(price)})`, align: "right", baseline: "middle" },
          styles: { color: l.color, backgroundColor: "transparent", size: 11 },
          ignoreEvent: true,
        });
      }
      return figures;
    },
  });

  // ---------- Canal paralelo: 2 cliques fazem a base, o 3º a largura ----------
  registerOverlay({
    name: "parallelChannel",
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    styles: { polygon: { color: `${ACCENT}1f` } },
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      if (coordinates.length < 3) return [{ type: "line", attrs: { coordinates: [a, b] } }];
      const c = coordinates[2];
      const slope = a.x === b.x ? 0 : (b.y - a.y) / (b.x - a.x);
      const dy = c.y - (a.y + slope * (c.x - a.x));
      const a2 = { x: a.x, y: a.y + dy };
      const b2 = { x: b.x, y: b.y + dy };
      const color = (overlay.styles?.line as { color?: string } | undefined)?.color ?? ACCENT;
      return [
        { type: "polygon", attrs: { coordinates: [a, b, b2, a2] }, styles: { style: "fill", color: `${color}1f` }, ignoreEvent: true },
        { type: "line", attrs: { coordinates: [a, b] } },
        { type: "line", attrs: { coordinates: [a2, b2] } },
        // Linha do meio, tracejada.
        { type: "line", attrs: { coordinates: [{ x: a.x, y: a.y + dy / 2 }, { x: b.x, y: b.y + dy / 2 }] }, styles: { style: "dashed", dashedValue: [4, 4] }, ignoreEvent: true },
      ];
    },
  });

  // ---------- VWAP ancorado: 1 clique escolhe a vela da âncora ----------
  const avwapMemo = new Map<string, { key: string; values: (number | null)[] }>();
  registerOverlay({
    name: "anchoredVwap",
    totalStep: 2,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    createPointFigures: ({ chart, overlay, xAxis, yAxis, coordinates }) => {
      const [p] = overlay.points;
      const data: KLineData[] = chart.getDataList();
      if (!coordinates.length || !xAxis || !yAxis || !data.length || typeof p?.timestamp !== "number") return [];
      const from = findBarIndex(data.map((d) => d.timestamp), p.timestamp);
      const last = data[data.length - 1];
      const key = `${from}:${data.length}:${last.timestamp}:${last.close}:${last.volume}`;
      let memo = avwapMemo.get(overlay.id);
      if (!memo || memo.key !== key) {
        memo = { key, values: anchoredVwap(data.map((d) => ({ ...d, volume: d.volume ?? 0 })), from) };
        avwapMemo.set(overlay.id, memo);
      }
      const range = chart.getVisibleRange();
      const pts: { x: number; y: number }[] = [];
      for (let i = Math.max(from, range.from - 1); i < Math.min(data.length, range.to + 1); i++) {
        const v = memo.values[i];
        if (v !== null) pts.push({ x: xAxis.convertToPixel(i), y: yAxis.convertToPixel(v) });
      }
      const color = (overlay.styles?.line as { color?: string } | undefined)?.color ?? "#f59e0b";
      const lastV = memo.values[data.length - 1];
      const figures: OverlayFigure[] = [];
      if (pts.length > 1) figures.push({ type: "line", attrs: { coordinates: pts }, styles: { color } });
      if (lastV !== null && pts.length) {
        const end = pts[pts.length - 1];
        figures.push({ type: "text", attrs: { x: end.x - 4, y: end.y - 4, text: `VWAP ancorado ${fmt(lastV)}`, align: "right", baseline: "bottom" }, styles: { color, backgroundColor: "transparent", size: 11 }, ignoreEvent: true });
      }
      return figures;
    },
  });

  // ---------- Perfil de volume da faixa escolhida (2 cliques: início e fim no tempo) ----------
  // Estimado: com velas OHLCV, o volume de cada vela é repartido por igual entre a mínima e a máxima.
  registerOverlay({
    name: "fixedRangeVolumeProfile",
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    createPointFigures: ({ chart, coordinates, overlay, yAxis, bounding }) => {
      if (coordinates.length < 2 || !yAxis) return [];
      const [p1, p2] = overlay.points;
      const data: KLineData[] = chart.getDataList();
      if (!data.length || typeof p1?.timestamp !== "number" || typeof p2?.timestamp !== "number") return [];
      const ts = data.map((d) => d.timestamp);
      const i1 = findBarIndex(ts, Math.min(p1.timestamp, p2.timestamp));
      const i2 = findBarIndex(ts, Math.max(p1.timestamp, p2.timestamp));
      const ex = extra(overlay.extendData);
      const rows = ex.rows ?? 24;
      const vp = volumeProfile(
        data.map((d) => ({ ...d, volume: d.volume ?? 0 })),
        i1,
        i2,
        rows,
        (ex.valueArea ?? 70) / 100,
      );
      if (!vp.bins.length) return [];
      const color = (overlay.styles?.line as { color?: string } | undefined)?.color ?? ACCENT;
      const x1 = Math.min(coordinates[0].x, coordinates[1].x);
      const x2 = Math.max(coordinates[0].x, coordinates[1].x);
      const span = Math.max(20, x2 - x1);
      const max = Math.max(...vp.bins.map((b) => b.volume)) || 1;
      const figures: OverlayFigure[] = [
        { type: "rect", attrs: { x: x1, y: 0, width: span, height: bounding.height }, styles: { style: "fill", color: `${color}0d` } },
      ];
      vp.bins.forEach((b, i) => {
        const yTop = yAxis.convertToPixel(b.to);
        const yBottom = yAxis.convertToPixel(b.from);
        const inValue = b.from >= vp.valueArea.low - 1e-12 && b.to <= vp.valueArea.high + 1e-12;
        figures.push({
          type: "rect",
          attrs: { x: x1, y: Math.min(yTop, yBottom), width: (b.volume / max) * span * 0.7, height: Math.max(1, Math.abs(yBottom - yTop) - 1) },
          styles: { style: "fill", color: i === vp.pocIndex ? "#f23645cc" : inValue ? `${color}88` : "#71717a55" },
          ignoreEvent: true,
        });
      });
      const poc = vp.bins[vp.pocIndex];
      const line = (price: number, label: string, c: string) => {
        const y = yAxis.convertToPixel(price);
        figures.push({ type: "line", attrs: { coordinates: [{ x: x1, y }, { x: x1 + span, y }] }, styles: { color: c, style: "dashed", dashedValue: [4, 3] }, ignoreEvent: true });
        figures.push({ type: "text", attrs: { x: x1 + span + 4, y, text: `${label} ${fmt(price)}`, baseline: "middle" }, styles: { color: c, backgroundColor: "transparent", size: 11 }, ignoreEvent: true });
      };
      line((poc.from + poc.to) / 2, "POC", "#f23645");
      line(vp.valueArea.high, "VAH", "#facc15");
      line(vp.valueArea.low, "VAL", "#facc15");
      figures.push({
        type: "text",
        attrs: { x: x1 + 2, y: bounding.height - 6, text: "Perfil estimado (OHLCV)", baseline: "bottom" },
        styles: { color: "#a1a1aa", backgroundColor: "transparent", size: 10 },
        ignoreEvent: true,
      });
      return figures;
    },
  });
}
