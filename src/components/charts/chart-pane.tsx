"use client";

import { useEffect, useRef, useState } from "react";
import { dispose, init, type Chart, type Indicator, type KLineData, type OverlayCreate, type OverlayMode, type Period } from "klinecharts";
import type { ChartInterval } from "@/lib/charts/params";
import { splitSymbol } from "@/lib/charts/params";
import type { AxisRangeState, IndicatorState, OverlayState, OverlayStyleState, PaneState, PaneView, SeriesStyle } from "@/lib/charts/workspace";
import { OVERLAY_VISUAL_KEYS, visualStyles } from "@/lib/charts/workspace";
import { AXIS_RANGE_KEYS } from "@/lib/charts/workspace";
import { NEO_COLORS } from "@/lib/charts/drawing";
import { ELLIOTT_LABELS } from "@/lib/charts/workspace";
import { MACRO_SERIES } from "@/lib/charts/macro-ids";
import { onchainInfo } from "@/lib/charts/onchain-ids";
import { compareDisplay, compareScale } from "@/lib/charts/compare";
import type { Point } from "@/lib/charts/macro-math";
import { COMPARE_COLORS, registerChartExtensions } from "./register";
import { LOG_AXIS, type OverlayExtra } from "./overlays";
import { SIDE_WIDTH_MAX, SIDE_WIDTH_MIN } from "@/lib/charts/workspace";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ColorPicker } from "./object-ui";
import { PROFILE_BUY, PROFILE_SELL } from "./profile";
import { DELTA_PROF, FOOTPRINT, MARKS, SIDE_INT, deltaHit, fmtFlow, footHit } from "./flow-layers";
import { DELTA_DEFAULTS } from "@/lib/charts/workspace";
import { pickSubInterval } from "@/lib/charts/flow";
import type { LayerStyles } from "@/lib/charts/workspace";
import { LIQ_MAP, SIDE_WIDTH, drawSideProfile, liqMapHit, mapTipLines, sideHit, sideTipLines } from "./liq-layers";
import { findBarIndex } from "@/lib/charts/drawing";
import { ema, sma } from "@/lib/charts/indicators";
import { crossPair, invertedPair, isMarketId, marketInfo, ratioCandles } from "@/lib/market/ids";

const PERIOD: Record<ChartInterval, Period> = {
  "1m": { type: "minute", span: 1 },
  "5m": { type: "minute", span: 5 },
  "15m": { type: "minute", span: 15 },
  "30m": { type: "minute", span: 30 },
  "1h": { type: "hour", span: 1 },
  "4h": { type: "hour", span: 4 },
  "6h": { type: "hour", span: 6 },
  "12h": { type: "hour", span: 12 },
  "1d": { type: "day", span: 1 },
  "2d": { type: "day", span: 2 },
  "3d": { type: "day", span: 3 },
  "1w": { type: "week", span: 1 },
  "1M": { type: "month", span: 1 },
  "6M": { type: "month", span: 6 },
  "1y": { type: "year", span: 1 },
};
const LIMIT = 500;
const POLL_MS = 15_000;
/** Para voltar a uma janela antiga: até 20 pedidos de 1.000 velas (20 mil velas). */
const RESTORE_PAGES = 20;
const RESTORE_LIMIT = 1000;
/** Ferramentas cujo dado extra é o texto (as outras guardam extensão, níveis etc.). */
const TEXT_TOOLS = new Set(["simpleAnnotation", "simpleTag"]);
/** Duração aproximada de uma vela por tempo do gráfico (para saber se as velas já são do tempo escolhido). */
const BAR_MS: Partial<Record<string, number>> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "6h": 21_600_000,
  "12h": 43_200_000,
  "1d": 86_400_000,
  "2d": 172_800_000,
  "3d": 259_200_000,
  "1w": 604_800_000,
};
/** Cursor de mover durante o arraste do corpo do perfil de volume (sobrepõe o cursor da biblioteca). */
const MOVE_CURSOR = "[&_*]:cursor-move!";
const PRICE_ONLY = new Set(["fixedRangeVolumeProfile", "fibonacciLine", "anchoredVwap", ...Object.keys(ELLIOTT_LABELS)]);
/** Indicadores com níveis de referência (linhas tracejadas configuráveis). */
const LEVEL_DEFAULTS: Record<string, number[]> = { RSI: [30, 50, 70], RSI_DIV: [30, 50, 70] };
/** Cores padrão das linhas dos indicadores (as mesmas da biblioteca). */
export const DEFAULT_LINE_COLORS = ["#FF9600", "#935EBD", "#2196F3", "#E11D74", "#01C5C4"];
/** Aparência padrão das séries de indicadores com estilo próprio (MA Ribbon NEO: cores das referências, MA 100 tracejada, MA 200 pontilhada). */
export const DEFAULT_SERIES: Record<string, SeriesStyle[]> = {
  MA_RIBBON_NEO: [
    ...NEO_COLORS.slice(0, 6).map((color) => ({ color, size: 1, style: "solid" as const })),
    { color: NEO_COLORS[6], size: 1.5, style: "dashed" },
    { color: NEO_COLORS[7], size: 1.5, style: "dotted" },
  ],
};
const dashOf = (style: string | undefined) => (style === "dashed" ? [6, 4] : style === "dotted" ? [1.5, 3] : [2, 2]);
/** Ponta da seta (mover para painel abaixo / voltar ao gráfico principal). */
const ARROW_PATHS = { down: "M6 1 L6 11 M2 7 L6 11 L10 7", up: "M6 11 L6 1 M2 5 L6 1 L10 5" };
const CHEVRON = { up: "M2 8 L6 4 L10 8", down: "M2 4 L6 8 L10 4" };
const EMPTY = "Ø";

// Tema escuro do app (fonte do app em todos os textos do gráfico).
const FONT = "Geist, ui-sans-serif, system-ui, sans-serif";
const text = { family: FONT };
const STYLES = {
  grid: { horizontal: { color: "#27272a" }, vertical: { color: "#1f1f23" } },
  candle: {
    bar: {
      upColor: "#22c55e",
      downColor: "#ef4444",
      noChangeColor: "#a1a1aa",
      upBorderColor: "#22c55e",
      downBorderColor: "#ef4444",
      upWickColor: "#22c55e",
      downWickColor: "#ef4444",
    },
    area: { lineColor: "#8b7cf6", backgroundColor: [{ offset: 0, color: "#8b7cf633" }, { offset: 1, color: "#8b7cf600" }] },
    tooltip: { title: { ...text, color: "#e4e4e7" }, legend: { ...text, color: "#a1a1aa" } },
    priceMark: { last: { upColor: "#22c55e", downColor: "#ef4444", text }, high: { textFamily: FONT }, low: { textFamily: FONT } },
  },
  indicator: { tooltip: { title: { ...text, color: "#e4e4e7" }, legend: { ...text, color: "#a1a1aa" } }, lastValueMark: { text } },
  xAxis: { axisLine: { color: "#3f3f46" }, tickText: { ...text, color: "#a1a1aa" } },
  yAxis: { axisLine: { color: "#3f3f46" }, tickText: { ...text, color: "#a1a1aa" } },
  separator: { color: "#3f3f46" },
  crosshair: { horizontal: { text: { ...text, backgroundColor: "#3f3f46" } }, vertical: { text: { ...text, backgroundColor: "#3f3f46" } } },
  overlay: { text, rectText: text },
};

// Ícones ao lado do nome do indicador (traços em uma caixa de 12×12).
const ICON_PATHS: Record<string, string> = {
  hide: "M1 6 Q6 0 11 6 Q6 12 1 6 Z M5 6 Q5 5 6 5 Q7 5 7 6 Q7 7 6 7 Q5 7 5 6 Z",
  show: "M1 6 Q6 0 11 6 Q6 12 1 6 Z M1 1 L11 11",
  settings: "M6 2.5 Q9.5 2.5 9.5 6 Q9.5 9.5 6 9.5 Q2.5 9.5 2.5 6 Q2.5 2.5 6 2.5 Z M6 0.5 L6 2.5 M6 9.5 L6 11.5 M0.5 6 L2.5 6 M9.5 6 L11.5 6 M2 2 L3.5 3.5 M8.5 8.5 L10 10 M2 10 L3.5 8.5 M8.5 3.5 L10 2",
  remove: "M1 3 L11 3 M4 3 L4 1 L8 1 L8 3 M2.5 3 L3.5 11 L8.5 11 L9.5 3",
  more: "M1.5 6 L2.5 6 M5.5 6 L6.5 6 M9.5 6 L10.5 6",
  star: "M6 0.8 L7.5 4.2 L11.2 4.5 L8.4 6.9 L9.3 10.6 L6 8.6 L2.7 10.6 L3.6 6.9 L0.8 4.5 L4.5 4.2 Z",
};
const feature = (id: string, path: string) => ({
  id,
  position: "middle" as const,
  type: "path" as const,
  content: { path, style: "stroke" as const, lineWidth: id === "more" ? 2 : 1.2 },
  size: 12,
  color: "#a1a1aa",
  activeColor: "#ffffff",
  backgroundColor: "transparent",
  activeBackgroundColor: "#3f3f46",
  borderRadius: 3,
  // Sem espaçamento interno: a área clicável fica exatamente sobre o ícone.
  paddingLeft: 0,
  paddingRight: 0,
  paddingTop: 0,
  paddingBottom: 0,
  marginLeft: 7,
  marginRight: 0,
  marginTop: 0,
  marginBottom: 0,
});

/**
 * Divide a altura entre o preço e os painéis de indicador: o preço fica com pelo menos 40%;
 * cada painel entre 36 e 120 px.
 */
function fitPanes(c: Chart, height: number) {
  const subPanes = [...new Set(c.getIndicators().map((i) => i.paneId))].filter((id) => id !== "candle_pane");
  if (!subPanes.length || height <= 0) return;
  const each = Math.max(36, Math.min(120, Math.floor((height * 0.6 - 30) / subPanes.length)));
  for (const id of subPanes) c.setPaneOptions({ id, height: each, minHeight: 30 });
}

/** Casas decimais do preço: mais casas para preços pequenos (ex.: pares em BTC). */
function precisionFor(price: number): number {
  if (!(price > 0)) return 2;
  return Math.min(10, Math.max(2, Math.ceil(-Math.log10(price)) + 4));
}

const DAY_MS = 86_400_000;
const INTRADAY: ChartInterval[] = ["1m", "5m", "15m", "30m", "1h", "4h", "6h", "12h"];
/** Início do período de cada tempo (UTC): agrupa a série diária pelo último valor de cada período. */
function bucketOf(t: number, interval: ChartInterval): number {
  const d = new Date(t);
  const day = Math.floor(t / DAY_MS) * DAY_MS;
  if (interval === "2d" || interval === "3d") {
    const n = interval === "2d" ? 2 : 3;
    return Math.floor(day / (n * DAY_MS)) * n * DAY_MS;
  }
  if (interval === "1w") return day - ((d.getUTCDay() + 6) % 7) * DAY_MS;
  if (interval === "1M") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  if (interval === "6M") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() < 6 ? 0 : 6, 1);
  if (interval === "1y") return Date.UTC(d.getUTCFullYear(), 0, 1);
  return day;
}

/**
 * Instrumento de mercado (TOTAL3, BTC.D...): só existem pontos diários reais, então cada ponto vira uma "vela" plana
 * (abertura = máxima = mínima = fechamento) e o gráfico é sempre desenhado como linha/área — nunca como velas.
 * Em tempos maiores que 1D, vale o último valor de cada período. Tempos intradiários não existem para estas séries.
 */
async function loadMarket(id: string, interval: ChartInterval, end: number | null): Promise<KLineData[]> {
  if (INTRADAY.includes(interval)) throw new Error("Série diária: escolha 1D ou um tempo maior");
  const res = await fetch(`/api/market?${new URLSearchParams({ id })}`);
  const body = (await res.json().catch(() => null)) as { points?: Point[]; error?: string } | null;
  if (!res.ok || !body?.points) throw new Error(body?.error ?? "Dados indisponíveis");
  // Capitalizações em bilhões de US$ (o nome do gráfico mostra a unidade); dominâncias em %.
  const scale = marketInfo(id)?.unit === "usd" ? 1e-9 : 1;
  const byBucket = new Map<number, number>();
  for (const [t, v] of body.points) byBucket.set(bucketOf(t, interval), v * scale);
  return [...byBucket.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([t]) => end === null || t <= end)
    .map(([timestamp, v]) => ({ timestamp, open: v, high: v, low: v, close: v }));
}

async function loadCandles(symbol: string, interval: ChartInterval, end: number | null, limit = LIMIT): Promise<KLineData[]> {
  if (isMarketId(symbol)) return loadMarket(symbol, interval, end);
  // Par invertido (BTC/ETH): as velas reais de ETH/BTC com os preços invertidos (máxima ↔ 1/mínima). Sem volume:
  // o volume da fonte está na outra moeda.
  const inverted = invertedPair(symbol);
  if (inverted) {
    const data = await loadCandles(inverted.source, interval, end, limit);
    return data.map((k) => ({ timestamp: k.timestamp, open: 1 / k.open, high: 1 / k.low, low: 1 / k.high, close: 1 / k.close }));
  }
  // Par cruzado (XLM/BTC...): razão das velas reais dos dois pares em USDT, no mesmo horário.
  const cross = crossPair(symbol);
  if (cross) {
    const [a, b] = await Promise.all([loadCandles(cross.numerator, interval, end, limit), loadCandles(cross.denominator, interval, end, limit)]);
    return ratioCandles(a, b);
  }
  const q = new URLSearchParams({ symbol, interval, limit: String(limit) });
  if (end !== null) q.set("end", String(end));
  const res = await fetch(`/api/candles?${q}`);
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Preços indisponíveis");
  return (await res.json()) as KLineData[];
}

/** Linhas tracejadas nos níveis de referência (ex.: RSI 30/50/70). Devolve false: a biblioteca desenha o resto. */
function drawLevels({ ctx, indicator, bounding, yAxis }: { ctx: CanvasRenderingContext2D; indicator: Indicator; bounding: { width: number }; yAxis: { convertToPixel: (v: number) => number } }) {
  const levels = (indicator.extendData as { levels?: number[] } | undefined)?.levels ?? [];
  if (!indicator.visible || !levels.length) return false;
  ctx.save();
  ctx.strokeStyle = "#71717a";
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  for (const l of levels) {
    const y = Math.round(yAxis.convertToPixel(l)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(bounding.width, y);
    ctx.stroke();
  }
  ctx.restore();
  return false;
}

type AxisLike = { getAutoCalcTickFlag: () => boolean; setAutoCalcTickFlag: (f: boolean) => void; getRange: () => unknown; setRange: (r: unknown) => void };
/** Eixo de preço do gráfico principal (API interna da biblioteca: getYAxes devolve os eixos com estes métodos). */
const priceAxis = (c: Chart) => (c.getYAxes({ paneId: "candle_pane" })[0] as unknown as AxisLike | undefined) ?? null;
/**
 * Cursor atual (API interna: a ação onCrosshairChange não avisa quando o cursor sai do gráfico).
 * Fora do gráfico, paneId fica vazio.
 */
const cursorOf = (c: Chart | null) =>
  (c as unknown as { getChartStore?: () => { getCrosshair: () => { paneId?: string; realDataIndex?: number } } } | null)?.getChartStore?.().getCrosshair() ?? null;

type ClickInfo = { paneId: string; overlay: { id: string } | null; figureType: string; figureIndex: number; figure: unknown };
type OverlayStore = {
  getClickOverlayInfo: () => ClickInfo;
  setClickOverlayInfo: (i: ClickInfo, onSel: () => void, onDesel: () => void) => void;
  /** Desenho sendo arrastado e por onde (figureType "point" = ponto de controle). */
  getPressedOverlayInfo?: () => ClickInfo;
};
const overlayStore = (c: Chart | null) => (c as unknown as { getChartStore?: () => OverlayStore } | null)?.getChartStore?.() ?? null;
/** Desenho que a biblioteca tem selecionado agora (API interna: é o que mostra os pontos de controle). */
const selectedInChart = (c: Chart | null) => overlayStore(c)?.getClickOverlayInfo().overlay?.id ?? null;
/** Tira a seleção dentro da biblioteca (some com os pontos de controle), sem disparar os avisos dela. */
const clearChartSelection = (c: Chart | null) => {
  overlayStore(c)?.setClickOverlayInfo({ paneId: "candle_pane", overlay: null, figureType: "none", figureIndex: -1, figure: null }, () => {}, () => {});
};

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Estilo salvo do desenho → estilo do KLineCharts. */
function overlayStyles(st: OverlayStyleState | undefined) {
  if (!st) return undefined;
  const dash = st.style === "dashed" ? [6, 4] : st.style === "dotted" ? [1.5, 3] : undefined;
  const line = {
    ...(st.color ? { color: st.color } : {}),
    ...(st.size ? { size: st.size } : {}),
    ...(st.style ? { style: st.style === "solid" ? "solid" : "dashed", dashedValue: dash ?? [2, 2] } : {}),
  };
  return {
    line,
    polygon: st.color ? { borderColor: st.color, borderSize: st.size ?? 1, color: `${st.color.slice(0, 7)}26` } : undefined,
    rect: st.color ? { borderColor: st.color, color: `${st.color.slice(0, 7)}26` } : undefined,
    text: st.textColor ? { color: st.textColor } : undefined,
    rectText: st.textColor ? { color: st.textColor } : undefined,
  } as never;
}

const overlayExtend = (o: OverlayState): unknown =>
  TEXT_TOOLS.has(o.name)
    ? o.text
    : ({
        extend: o.styles?.extend,
        levels: o.styles?.levels,
        rows: o.styles?.rows,
        valueArea: o.styles?.valueArea,
        buyColor: o.styles?.buyColor,
        sellColor: o.styles?.sellColor,
        labelSize: o.styles?.labelSize,
        showLabels: o.styles?.showLabels,
        showPoints: o.styles?.showPoints,
        labels: o.styles?.labels,
        labelPosition: o.styles?.labelPosition,
        shift: o.styles?.shiftBars,
        mirror: o.styles?.mirror,
        histWidth: o.styles?.histWidth,
        windowFrom: o.styles?.windowFrom,
        windowTo: o.styles?.windowTo,
      } satisfies OverlayExtra);

/** Dados extras do indicador (tipos e fonte das médias, níveis, cores e modo do delta). */
function indicatorExtend(ind: IndicatorState): Record<string, unknown> | undefined {
  const o = ind.options ?? {};
  const out: Record<string, unknown> = {};
  if (o.types) out.types = o.types;
  if (o.source) out.source = o.source;
  if (o.upColor) out.upColor = o.upColor;
  if (o.downColor) out.downColor = o.downColor;
  if (o.mode) out.mode = o.mode;
  if (LEVEL_DEFAULTS[ind.name]) out.levels = o.levels ?? LEVEL_DEFAULTS[ind.name];
  return Object.keys(out).length ? out : undefined;
}

/** Data da vela na legenda, conforme o tempo do gráfico. */
function formatBarTime(ts: number, interval: ChartInterval): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  if (/^(1M|6M|1y)$/.test(interval)) return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
  if (/[dw]$/.test(interval)) return day;
  return `${day} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Formata um valor da legenda (números grandes como 1.2M). */
function formatValue(v: unknown, precision: number, big: boolean): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "n/a";
  if (big && Math.abs(v) >= 1000) return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(v);
  return v.toLocaleString("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision });
}

export type PaneHandle = {
  /** Começa a desenhar uma ferramenta (nome do KLineCharts); o gráfico não se move até terminar ou cancelar. */
  draw: (tool: string) => void;
  /** Cancela o desenho em andamento (Esc). Devolve true se havia um. */
  cancelDraw: () => boolean;
  setMagnet: (on: boolean) => void;
  setHidden: (what: "drawings" | "indicators", hidden: boolean) => void;
  clearDrawings: () => void;
  /** Aplica mudanças a um desenho (estilo, visível, bloqueado, pontos, texto). */
  updateOverlay: (id: string, patch: Partial<OverlayState>) => void;
  removeOverlay: (id: string) => void;
  duplicateOverlay: (id: string) => string | null;
  orderOverlay: (id: string, to: "front" | "back" | "forward" | "backward") => void;
  deselect: () => void;
  /** Séries de um indicador (para a aba Estilo das configurações). */
  getFigures: (id: string) => { key: string; title: string; line: boolean; color: string; size: number; style: "solid" | "dashed" | "dotted" }[];
};

export type IndicatorAction = { id: string; action: string; x: number; y: number };
/** Ícones da legenda de uma comparação (índice na lista de comparações da divisão). */
export type CompareAction = { index: number; action: string; x: number; y: number };

/** Um gráfico (uma divisão): velas da Binance, indicadores e desenhos do estado salvo. */
export function ChartPane({
  pane,
  active,
  onActivate,
  onOverlays,
  onError,
  onSelect,
  onObjectSettings,
  onIndicatorAction,
  onCompareAction,
  onLegendCollapse,
  onAutoScaleChange,
  favoriteIndicators,
  onDrawingChange,
  onViewChange,
  onSideWidthChange,
  onSideColorsChange,
  onSideIntegratedChange,
  layerStyles,
  onLayerStylesChange,
  onDeltaIntegratedChange,
  sideColorsDefault,
  styleDefaults,
  onStyleDefault,
  handleRef,
  children,
}: {
  /** Largura do perfil lateral escolhida arrastando a borda dele (salva no gráfico). */
  onSideWidthChange?: (width: number) => void;
  /** Cores do perfil lateral escolhidas pela seleção dele (salvas na conta). */
  onSideColorsChange?: (colors: { buy?: string; sell?: string }) => void;
  /** Estilos das camadas de fluxo (marcações, Delta Horizontal, Footprint), da conta. */
  layerStyles?: LayerStyles;
  /** Estilos das camadas mudados direto no gráfico (minibarra/largura do Delta Horizontal). */
  onLayerStylesChange?: (next: LayerStyles) => void;
  /** Delta Horizontal integrado ao gráfico (true) ou em painel próprio (false); salvo no gráfico. */
  onDeltaIntegratedChange?: (integrated: boolean) => void;
  /** Perfil lateral integrado ao gráfico (true) ou em painel próprio (false); salvo no gráfico. */
  onSideIntegratedChange?: (integrated: boolean) => void;
  /** Cores do perfil lateral da conta (valem quando o gráfico não tem as suas, de versões antigas). */
  sideColorsDefault?: { buy?: string; sell?: string };
  /** Padrão visual de cada tipo de desenho (da conta): um desenho novo nasce com o do seu tipo. */
  styleDefaults?: Record<string, OverlayStyleState>;
  /** O visual de um desenho mudou (configurações ou barra rápida): vira o padrão do tipo dele. */
  onStyleDefault?: (tool: string, styles: OverlayStyleState) => void;
  /** Zoom e posição atuais (para voltar igual ao reabrir a aba, a página ou o mesmo par/tempo). */
  onViewChange?: (v: PaneView) => void;
  /** Clique nos ícones da legenda de uma comparação (ocultar, configurar, remover, mover de painel). */
  onCompareAction: (a: CompareAction) => void;
  /** Seta "^" ao lado do título: recolhe/mostra as legendas dos indicadores. */
  onLegendCollapse: (collapsed: boolean) => void;
  /** Ajuste manual da escala de preço com o modo A ligado: o botão passa para N (como no TradingView). */
  onAutoScaleChange: (auto: boolean) => void;
  /** Indicadores favoritos da conta (estrela na legenda de cada indicador). */
  favoriteIndicators: string[];
  pane: PaneState;
  active: boolean;
  onActivate: () => void;
  onOverlays: (overlays: OverlayState[]) => void;
  onError: (message: string | null) => void;
  /** Desenho selecionado (clique esquerdo) ou null (clique no vazio). */
  onSelect: (id: string | null) => void;
  /** Clique direito sobre um desenho: abre as configurações completas. */
  onObjectSettings: (id: string) => void;
  /** Clique nos ícones ao lado do nome de um indicador. */
  onIndicatorAction: (a: IndicatorAction) => void;
  /** Ferramenta em uso (true) ou navegação (false). */
  onDrawingChange: (drawing: boolean) => void;
  handleRef: (h: PaneHandle | null) => void;
  /** Elementos por cima do gráfico (ex.: barra rápida do desenho selecionado). */
  children?: React.ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<Chart | null>(null);
  const magnet = useRef<OverlayMode>("normal");
  const cb = useRef({ onOverlays, onError, onSelect, onObjectSettings, onIndicatorAction, onCompareAction, onLegendCollapse, onAutoScaleChange, onDrawingChange, onViewChange, onSideWidthChange, onSideColorsChange, onSideIntegratedChange, onStyleDefault, onLayerStylesChange, onDeltaIntegratedChange });
  useEffect(() => {
    cb.current = { onOverlays, onError, onSelect, onObjectSettings, onIndicatorAction, onCompareAction, onLegendCollapse, onAutoScaleChange, onDrawingChange, onViewChange, onSideWidthChange, onSideColorsChange, onSideIntegratedChange, onStyleDefault, onLayerStylesChange, onDeltaIntegratedChange };
  });
  const styleDefaultsRef = useRef(styleDefaults);
  useEffect(() => {
    styleDefaultsRef.current = styleDefaults;
  }, [styleDefaults]);
  // Botão A/N (ver abaixo): ajuste automático da escala de preço.
  const autoScale = useRef(pane.autoScale === true);
  // ---------- Zoom e posição de cada par/tempo ----------
  // A janela salva volta ao montar o gráfico (trocar de aba, sair e voltar à página, recarregar) e ao voltar a um
  // par/tempo já visto. Enquanto a janela salva é aplicada, as mudanças da própria carga não são salvas.
  const savedViews = useRef(pane.views);
  useEffect(() => {
    savedViews.current = pane.views;
  });
  /** Par/tempo que o gráfico mostra agora (só depois de carregado). */
  const shown = useRef<{ symbol: string; interval: ChartInterval } | null>(null);
  const restoring = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const snapshotView = (c: Chart): PaneView | null => {
    const at = shown.current;
    const data = c.getDataList();
    if (!at || !data.length || restoring.current) return null;
    const barSpace = c.getBarSpace().bar;
    const width = c.getSize("candle_pane", "main")?.width ?? 0;
    const xOf = (p: { timestamp?: number; dataIndex?: number }) => (c.convertToPixel(p, { paneId: "candle_pane" }) as { x?: number }).x;
    // Acompanhando o tempo atual: a vela mais recente está na tela. Senão, a âncora é a vela do centro da tela
    // (sempre carregada e visível), com a posição exata em pixels.
    const lastX = xOf({ dataIndex: data.length - 1 });
    let to: number | null = null;
    if (!(typeof lastX === "number" && lastX <= width)) {
      const mid = c.convertFromPixel([{ x: width / 2 }], { paneId: "candle_pane" }) as { dataIndex?: number }[];
      const i = Math.max(0, Math.min(data.length - 1, Math.round(mid[0]?.dataIndex ?? data.length - 1)));
      to = data[i].timestamp;
    }
    let y: AxisRangeState | undefined;
    const axis = priceAxis(c);
    if (axis && !autoScale.current) {
      const range = axis.getRange() as Record<string, unknown>;
      y = {};
      for (const k of AXIS_RANGE_KEYS) if (typeof range[k] === "number" && Number.isFinite(range[k])) y[k] = range[k] as number;
    }
    // Distância da âncora até a borda direita (a biblioteca segura a posição pela direita quando a largura muda).
    const px = to === null ? undefined : xOf({ timestamp: to });
    const toX = typeof px === "number" && Number.isFinite(px) ? Math.round((width - px) * 10) / 10 : undefined;
    return { symbol: at.symbol, interval: at.interval, barSpace: Math.round(barSpace * 1000) / 1000, to, ...(toX === undefined ? {} : { toX }), ...(y ? { y } : {}) };
  };
  const flushView = () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    const c = chart.current;
    const v = c ? snapshotView(c) : null;
    if (v) cb.current.onViewChange?.(v);
  };
  const scheduleView = () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushView, 600);
  };
  // Botão A/N. A: a escala de preço acompanha as velas visíveis (o ajuste automático da biblioteca).
  // N: o enquadramento fica como está (mover e dar zoom continuam livres, só sem reajuste automático).
  /** Modo N: congela a faixa de preço atual (sai do automático sem mudar o que está na tela). */
  const freezePrice = (c: Chart) => {
    const a = priceAxis(c);
    if (a?.getAutoCalcTickFlag()) a.setRange(a.getRange());
  };
  /**
   * Enquadra uma vez (par, tempo ou escala novos: a faixa anterior não serve) e, no modo N, congela de novo
   * logo depois de a biblioteca calcular a faixa.
   */
  /** Faixa de preço salva (modo N) a aplicar no próximo enquadramento. */
  const pendingY = useRef<AxisRangeState | null>(null);
  /** Janela salva a realinhar depois do enquadramento (a largura do eixo de preço pode ter mudado). */
  const pendingAlign = useRef<PaneView | null>(null);
  /** Leva a vela-âncora exatamente à posição salva (contada a partir da borda direita). */
  const alignTo = (c: Chart, v: PaneView) => {
    if (v.to === null) return;
    c.scrollToTimestamp(v.to);
    const width = c.getSize("candle_pane", "main")?.width ?? 0;
    const now = (c.convertToPixel({ timestamp: v.to }, { paneId: "candle_pane" }) as { x?: number }).x;
    if (typeof v.toX === "number" && typeof now === "number" && width > 0) c.scrollByDistance(width - v.toX - now);
  };
  const fitOnce = (c: Chart) => {
    priceAxis(c)?.setAutoCalcTickFlag(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (chart.current !== c) return;
        const y = pendingY.current;
        pendingY.current = null;
        const align = pendingAlign.current;
        pendingAlign.current = null;
        if (!autoScale.current) {
          const a = priceAxis(c);
          // Modo N com faixa salva: volta exatamente ao enquadramento de antes; senão congela o atual.
          if (y && a) a.setRange({ ...(a.getRange() as object), ...y });
          else freezePrice(c);
          if (y) c.resize();
        }
        if (align) alignTo(c, align);
      }),
    );
  };
  // Estado de exibição lido pelas legendas (sem recriar indicadores).
  const view = useRef({ collapsed: !!pane.legendCollapsed, showOhlc: pane.showOhlc !== false, interval: pane.interval });
  // Comparação de cada indicador criado (id do indicador → índice na lista).
  const compareIndex = useRef(new Map<string, number>());
  // A vela mais recente saiu da tela (mostra o botão para voltar ao tempo atual).
  const [away, setAway] = useState(false);
  // Estado salvo de cada desenho (estilo no nosso formato), por id.
  const meta = useRef(new Map<string, OverlayState>());
  const drawingId = useRef<string | null>(null);
  const mouse = useRef({ x: 0, y: 0 });
  const pressAt = useRef<{ x: number; y: number } | null>(null);
  // Navegação: arraste na escala de tempo (desloca o gráfico) e arraste no preço (livre já no 1º gesto).
  const hoverOverlay = useRef(false);
  const favorites = useRef(favoriteIndicators);
  useEffect(() => {
    favorites.current = favoriteIndicators;
    // Redesenha as legendas (a estrela muda na hora).
    chart.current?.resize();
  }, [favoriteIndicators]);
  // Arraste do histograma de um perfil de volume (id e deslocamento no começo).
  const profileDrag = useRef<{ id: string; shift: number } | null>(null);
  const timeDrag = useRef<{ x: number; anchor: number } | null>(null);
  const priceDrag = useRef<{ y: number; wasAuto: boolean } | null>(null);
  const indicatorState = useRef(new Map<string, IndicatorState>());

  // Cria o gráfico uma vez.
  useEffect(() => {
    registerChartExtensions();
    const node = el.current;
    if (!node) return;
    const c = init(node, {
      locale: "en-US",
      styles: STYLES,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      // Velas podem ficar bem finas ao afastar (a biblioteca desenha cada uma com pelo menos 1 px).
      layout: { barSpaceLimit: { min: 0.3, max: 60 } },
      // Números pequenos por extenso (ex.: 0.000017373 em USDTUSD/BTCUSD); a forma compacta "0.0{4}17373" só a
      // partir de 8 zeros.
      decimalFold: { threshold: 8 },
    });
    chart.current = c;
    // Arrastar a escala de tempo desloca o gráfico inteiro (abaixo); a biblioteca dava zoom ancorado no ponto do arraste.
    c?.overrideXAxis({ scrollZoomEnabled: false });
    const ro = new ResizeObserver(() => {
      if (!c) return;
      fitPanes(c, node.clientHeight);
      c.resize();
    });
    ro.observe(node);
    // Ícones ao lado do nome dos indicadores.
    const onFeature = (data?: unknown) => {
      const d = data as { indicator?: Indicator; feature?: { id: string } } | undefined;
      if (!d?.indicator || !d.feature) return;
      const cmp = compareIndex.current.get(d.indicator.id);
      if (cmp !== undefined) cb.current.onCompareAction({ index: cmp, action: d.feature.id, ...mouse.current });
      else cb.current.onIndicatorAction({ id: d.indicator.id, action: d.feature.id, ...mouse.current });
    };
    c?.subscribeAction("onIndicatorTooltipFeatureClick", onFeature);
    // Seta "^" ao lado do título do gráfico: recolhe ou mostra as legendas dos indicadores.
    c?.subscribeAction("onCandleTooltipFeatureClick", (data?: unknown) => {
      if ((data as { feature?: { id: string } } | undefined)?.feature?.id === "collapse") cb.current.onLegendCollapse(!view.current.collapsed);
    });
    // Botão "tempo atual" só quando a vela mais recente saiu da tela (navegando no histórico).
    c?.subscribeAction("onVisibleRangeChange", (data?: unknown) => {
      const r = data as { realTo?: number } | undefined;
      const n = c.getDataList().length;
      setAway(!!n && typeof r?.realTo === "number" && r.realTo < n - 1);
      scheduleView();
    });
    return () => {
      // Sai da aba ou da página: guarda a janela atual antes de desmontar.
      flushView();
      ro.disconnect();
      dispose(node);
      chart.current = null;
    };
    // Criado uma vez; flushView/scheduleView leem só refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Desenhos: lê do gráfico e avisa a tela (que salva na conta).
  const emitOverlays = () => {
    const c = chart.current;
    if (!c) return;
    const list = c
      .getOverlays()
      .filter((o) => o.id !== drawingId.current)
      .sort((a, b) => a.zLevel - b.zLevel)
      .map((o) => {
        const saved = meta.current.get(o.id);
        const item: OverlayState = {
          id: o.id,
          name: o.name,
          points: o.points
            .filter((p) => typeof p.timestamp === "number" && typeof p.value === "number")
            .map((p) => ({ timestamp: p.timestamp as number, value: p.value as number })),
        };
        if (typeof o.extendData === "string" && o.extendData) item.text = o.extendData;
        if (saved?.styles && Object.keys(saved.styles).length) item.styles = saved.styles;
        if (!o.visible) item.visible = false;
        if (o.lock) item.locked = true;
        if (saved?.lockX) item.lockX = true;
        if (saved?.lockY) item.lockY = true;
        meta.current.set(o.id, item);
        return item;
      });
    cb.current.onOverlays(list);
  };

  const finishDrawing = () => {
    drawingId.current = null;
    chart.current?.setScrollEnabled(true);
    cb.current.onDrawingChange(false);
  };

  // Eventos de cada desenho: seleção, configurações (clique direito) e salvamento.
  const overlayEvents = {
    // Ao terminar, o desenho fica selecionado (a biblioteca já o marca), com a barra rápida.
    onDrawEnd: ({ overlay }: { overlay: { id: string } }) => {
      finishDrawing();
      emitOverlays();
      cb.current.onSelect(overlay.id);
      return false;
    },
    onMouseEnter: () => {
      hoverOverlay.current = true;
      return false;
    },
    onMouseLeave: () => {
      hoverOverlay.current = false;
      return false;
    },
    onClick: ({ overlay }: { overlay: { id: string } }) => {
      if (overlay.id !== drawingId.current) cb.current.onSelect(overlay.id);
      return false;
    },
    // Perfil de volume (faixa fixa): arrastar o histograma (não os pontos). A biblioteca move os dois pontos junto;
    // aqui eles voltam ao tempo original (a janela analisada não muda) e:
    // - o movimento horizontal vira deslocamento da exibição (como antes);
    // - o vertical (perfil por faixa de preço) move a FAIXA DE PREÇO analisada: a mesma variação de preço nos dois
    //   pontos (amplitude constante, em preço, também na escala log), arredondada à precisão do par. O histograma, a
    //   POC, a VAH e a VAL são recalculados para a nova faixa (o desenho calcula a partir dos dois preços).
    onPressedMoveStart: ({ overlay, figure }: { overlay: { id: string; name: string; extendData?: unknown }; figure?: { key?: string } }) => {
      if (overlay.name === "fixedRangeVolumeProfile" && figure?.key === "vp_body") {
        profileDrag.current = { id: overlay.id, shift: (overlay.extendData as OverlayExtra | undefined)?.shift ?? 0 };
        el.current?.classList.add(...MOVE_CURSOR.split(" "));
      }
      return false;
    },
    onPressedMoving: (e: { overlay: { id: string; points: { timestamp?: number; value?: number; dataIndex?: number }[]; extendData?: unknown }; preventDefault?: () => void }) => {
      const d = profileDrag.current;
      const c = chart.current;
      const prev = (e.overlay as unknown as { _prevPressedPoints?: { timestamp?: number; value?: number; dataIndex?: number }[] })._prevPressedPoints;
      // Bloqueios por eixo (barra rápida): no arraste do desenho inteiro (não de um ponto de controle), o eixo
      // bloqueado volta ao valor do início do arraste.
      const saved = meta.current.get(e.overlay.id);
      const lockX = !!saved?.lockX;
      const lockY = !!saved?.lockY;
      const wholeDrag = overlayStore(c)?.getPressedOverlayInfo?.().figureType !== "point";
      if ((!d || d.id !== e.overlay.id) && wholeDrag && (lockX || lockY) && prev?.length === e.overlay.points.length) {
        e.overlay.points = e.overlay.points.map((p, i) => ({
          ...p,
          ...(lockX ? { timestamp: prev[i].timestamp, dataIndex: prev[i].dataIndex } : {}),
          ...(lockY ? { value: prev[i].value } : {}),
        }));
        return false;
      }
      if (!d || d.id !== e.overlay.id || !c || !prev?.length) return false;
      const ts = c.getDataList().map((k) => k.timestamp);
      const at = (p: { timestamp?: number; dataIndex?: number }) => (typeof p.dataIndex === "number" ? p.dataIndex : typeof p.timestamp === "number" ? findBarIndex(ts, p.timestamp) : 0);
      const moved = lockX ? 0 : at(e.overlay.points[0]) - at(prev[0]);
      const ex = e.overlay.extendData as OverlayExtra | undefined;
      const band = typeof ex?.windowFrom === "number" && typeof ex?.windowTo === "number" && prev.every((p) => typeof p.value === "number");
      const now = e.overlay.points[0]?.value;
      const digits = Math.max(0, Math.min(12, c.getSymbol()?.pricePrecision ?? 2));
      const dv = band && !lockY && typeof now === "number" ? Number((now - (prev[0].value as number)).toFixed(digits)) : 0;
      e.overlay.points = prev.map((p) => ({ ...p, ...(dv ? { value: Number(((p.value as number) + dv).toFixed(digits)) } : {}) }));
      c.overrideOverlay({ id: d.id, extendData: { ...(e.overlay.extendData as object), shift: d.shift + moved } });
      return false;
    },
    onPressedMoveEnd: ({ overlay }: { overlay: { id: string; extendData?: unknown } }) => {
      const d = profileDrag.current;
      profileDrag.current = null;
      el.current?.classList.remove(...MOVE_CURSOR.split(" "));
      if (d && d.id === overlay.id) {
        const cur = meta.current.get(d.id);
        const shift = Math.round((overlay.extendData as OverlayExtra | undefined)?.shift ?? 0);
        if (cur) meta.current.set(d.id, { ...cur, styles: { ...cur.styles, shiftBars: shift } });
      }
      emitOverlays();
      return false;
    },
    // onRemoved chega antes de a biblioteca tirar o desenho da lista: espera ela terminar.
    onRemoved: ({ overlay }: { overlay: { id: string } }) => {
      if (overlay.id === drawingId.current) finishDrawing();
      meta.current.delete(overlay.id);
      setTimeout(emitOverlays, 0);
      return false;
    },
    onSelected: ({ overlay }: { overlay: { id: string } }) => {
      if (overlay.id !== drawingId.current) cb.current.onSelect(overlay.id);
      return false;
    },
    onDeselected: () => {
      cb.current.onSelect(null);
      return false;
    },
    // Clique direito: sem isso a biblioteca apaga o desenho. Durante o desenho, cancela (comportamento normal).
    onRightClick: (e: { overlay: { id: string }; preventDefault?: () => void }) => {
      if (e.overlay.id === drawingId.current) return false;
      e.preventDefault?.();
      cb.current.onSelect(e.overlay.id);
      cb.current.onObjectSettings(e.overlay.id);
      return true;
    },
  };

  const createFromState = (c: Chart, o: OverlayState, zLevel: number) => {
    const id = o.id ?? newId("d");
    const st: OverlayState = { ...o, id };
    meta.current.set(id, st);
    c.createOverlay({
      id,
      name: o.name,
      points: o.points,
      extendData: overlayExtend(st),
      styles: overlayStyles(o.styles),
      visible: o.visible !== false,
      lock: o.locked === true,
      zLevel,
      mode: magnet.current,
      ...overlayEvents,
    } as OverlayCreate);
    return id;
  };

  // Ações da barra lateral, da barra rápida e dos atalhos.
  useEffect(() => {
    handleRef({
      draw: (tool) => {
        const c = chart.current;
        if (!c) return;
        if (drawingId.current) c.removeOverlay({ id: drawingId.current });
        let text: string | undefined;
        if (TEXT_TOOLS.has(tool)) {
          text = (window.prompt("Texto:") ?? "").slice(0, 200).trim();
          if (!text) return;
        }
        const id = newId("d");
        // Perfil de volume: a faixa de preço vem dos 2 cliques; o tempo do cálculo é fixado agora (velas visíveis),
        // para a distância horizontal entre os cliques não virar intervalo de tempo.
        let profileWindow: { windowFrom: number; windowTo: number } | null = null;
        if (tool === "fixedRangeVolumeProfile") {
          const list = c.getDataList();
          const r = c.getVisibleRange();
          const a = list[Math.max(0, Math.min(list.length - 1, r.from))]?.timestamp;
          const z = list[Math.max(0, Math.min(list.length - 1, r.to - 1))]?.timestamp;
          if (typeof a === "number" && typeof z === "number" && a <= z) profileWindow = { windowFrom: a, windowTo: z };
        }
        // Desenho novo: nasce com o padrão visual do seu tipo (só o visual; pontos e o resto são dele).
        const inherited = visualStyles(styleDefaultsRef.current?.[tool]);
        const startStyles = profileWindow || Object.keys(inherited).length ? { ...inherited, ...(profileWindow ?? {}) } : null;
        meta.current.set(id, { id, name: tool, points: [], ...(text ? { text } : {}), ...(startStyles ? { styles: startStyles } : {}) });
        drawingId.current = id;
        // A ferramenta tem prioridade: o primeiro clique marca o ponto em vez de mover o gráfico.
        c.setScrollEnabled(false);
        cb.current.onDrawingChange(true);
        const z = c.getOverlays().length;
        c.createOverlay({
          id,
          name: tool,
          mode: magnet.current,
          extendData: TEXT_TOOLS.has(tool) ? text : overlayExtend(meta.current.get(id) as OverlayState),
          ...(startStyles ? { styles: overlayStyles(startStyles) } : {}),
          zLevel: z,
          // O perfil de volume usa os preços das velas: fica sempre no gráfico de preço.
          ...(PRICE_ONLY.has(tool) ? { paneId: "candle_pane" } : {}),
          ...overlayEvents,
        } as OverlayCreate);
      },
      cancelDraw: () => {
        const c = chart.current;
        const id = drawingId.current;
        if (!c || !id) return false;
        meta.current.delete(id);
        c.removeOverlay({ id });
        finishDrawing();
        return true;
      },
      setMagnet: (on) => {
        magnet.current = on ? "weak_magnet" : "normal";
        chart.current?.overrideOverlay({ mode: magnet.current });
      },
      setHidden: (what, hidden) => {
        const c = chart.current;
        if (!c) return;
        if (what === "drawings") {
          // Respeita os desenhos ocultos um a um.
          for (const o of c.getOverlays()) c.overrideOverlay({ id: o.id, visible: !hidden && meta.current.get(o.id)?.visible !== false });
        } else
          for (const i of c.getIndicators()) {
            // Mapa de liquidações e perfil lateral têm botões próprios: "ocultar indicadores" não mexe neles.
            if (i.name === LIQ_MAP) continue;
            c.overrideIndicator({ id: i.id, name: i.name, visible: !hidden && indicatorState.current.get(i.id)?.visible !== false });
          }
      },
      clearDrawings: () => {
        chart.current?.removeOverlay();
        meta.current.clear();
        emitOverlays();
      },
      updateOverlay: (id, patch) => {
        const c = chart.current;
        const cur = meta.current.get(id);
        if (!c || !cur) return;
        const next: OverlayState = { ...cur, ...patch, styles: patch.styles ? { ...cur.styles, ...patch.styles } : cur.styles };
        meta.current.set(id, next);
        // Mudança visual confirmada (configurações "Ok" ou barra rápida) vira o padrão do tipo. A prévia da largura do
        // histograma (só histWidth, enquanto a janela está aberta) não conta: o "Ok" é que confirma.
        const keys = patch.styles ? Object.keys(patch.styles) : [];
        const preview = keys.length === 1 && keys[0] === "histWidth";
        if (!preview && keys.some((k) => (OVERLAY_VISUAL_KEYS as readonly string[]).includes(k))) cb.current.onStyleDefault?.(next.name, visualStyles(next.styles));
        c.overrideOverlay({
          id,
          ...(patch.points ? { points: patch.points } : {}),
          extendData: overlayExtend(next),
          styles: overlayStyles(next.styles) ?? null,
          visible: next.visible !== false,
          lock: next.locked === true,
        } as Partial<OverlayCreate>);
        emitOverlays();
      },
      removeOverlay: (id) => {
        chart.current?.removeOverlay({ id });
      },
      duplicateOverlay: (id) => {
        const c = chart.current;
        const cur = meta.current.get(id);
        if (!c || !cur) return null;
        const copy = createFromState(c, { ...cur, id: newId("d"), visible: true, locked: false, lockX: false, lockY: false }, c.getOverlays().length);
        emitOverlays();
        return copy;
      },
      orderOverlay: (id, to) => {
        const c = chart.current;
        if (!c) return;
        const list = c.getOverlays().sort((a, b) => a.zLevel - b.zLevel);
        const i = list.findIndex((o) => o.id === id);
        if (i < 0) return;
        const [item] = list.splice(i, 1);
        const j = to === "front" ? list.length : to === "back" ? 0 : to === "forward" ? Math.min(list.length, i + 1) : Math.max(0, i - 1);
        list.splice(j, 0, item);
        list.forEach((o, z) => c.overrideOverlay({ id: o.id, zLevel: z }));
        emitOverlays();
      },
      deselect: () => {
        clearChartSelection(chart.current);
        cb.current.onSelect(null);
      },
      getFigures: (id) => {
        const [ind] = chart.current?.getIndicators({ id }) ?? [];
        if (!ind) return [];
        let j = -1;
        const defaults = DEFAULT_SERIES[ind.name];
        return ind.figures.map((f) => {
          const line = (f.type ?? "line") === "line";
          if (line) j++;
          const k = Math.max(0, j);
          const fallback = defaults?.[k]?.color ?? DEFAULT_LINE_COLORS[k % DEFAULT_LINE_COLORS.length];
          const color = (line && (ind.styles?.lines?.[j]?.color as string | undefined)) || fallback;
          return {
            key: f.key,
            title: (f.title ?? "").replace(/:\s*$/, ""),
            line,
            color: color === "#00000000" ? fallback : color,
            size: defaults?.[k]?.size ?? 1,
            style: defaults?.[k]?.style ?? "solid",
          };
        });
      },
    });
    return () => handleRef(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Par e tempo: carrega as velas (e mais ao rolar para trás) e atualiza a última a cada 15 s.
  // Cada troca de par/tempo é uma "geração": respostas de gerações antigas são descartadas,
  // para uma carga lenta do par anterior nunca sobrescrever o gráfico atual.
  const generation = useRef(0);
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const gen = ++generation.current;
    const current = () => generation.current === gen && chart.current === c;
    const { symbol, interval } = pane;
    let poll: ReturnType<typeof setInterval> | undefined;
    const fallback = splitSymbol(symbol)?.quote === "USDT" ? 2 : 8;
    // Guarda a janela do par/tempo anterior antes de trocar; a do novo (se já visto) volta depois da carga.
    if (shown.current && (shown.current.symbol !== symbol || shown.current.interval !== interval)) flushView();
    const want = savedViews.current?.find((v) => v.symbol === symbol && v.interval === interval) ?? null;
    restoring.current = true;

    void (async () => {
      // Busca primeiro (para já saber as casas decimais) e só então troca o par no gráfico.
      let first: KLineData[] | null = null;
      let more = false;
      try {
        first = await loadCandles(symbol, interval, null);
        more = first.length === LIMIT;
        // Janela salva no passado: carrega velas mais antigas até cobrir a data (com teto de pedidos).
        if (want?.to != null) {
          for (let i = 0; i < RESTORE_PAGES && more && first.length && first[0].timestamp > want.to; i++) {
            const oldest: number = first[0].timestamp;
            const page: KLineData[] = await loadCandles(symbol, interval, oldest - 1, RESTORE_LIMIT);
            if (!current()) return;
            // Só velas realmente mais antigas (a ordem do tempo nunca se mistura); sem novas, para.
            const older: KLineData[] = page.filter((k) => k.timestamp < oldest);
            more = page.length === RESTORE_LIMIT && older.length > 0;
            if (!older.length) break;
            first = [...older, ...first];
          }
        }
        if (current()) cb.current.onError(null);
      } catch (e) {
        if (current()) cb.current.onError(e instanceof Error ? e.message : "Preços indisponíveis");
      }
      if (!current()) return;
      // Sem dados (falha na carga): nada a restaurar; as próximas mudanças já podem ser salvas.
      if (!first?.length) {
        restoring.current = false;
        shown.current = { symbol, interval };
      }
      const precision = first?.length ? precisionFor(first[first.length - 1].close) : fallback;
      // Par/tempo novo: enquadra os preços novos (no modo N, congela em seguida).
      fitOnce(c);
      // Instrumento de mercado: nome com a unidade (ex.: "TOTAL3 (US$ bi)", "BTC.D (%)").
      const info = marketInfo(symbol);
      const ticker = info ? `${info.short} (${info.unit === "usd" ? "US$ bi" : "%"})` : (invertedPair(symbol)?.label ?? crossPair(symbol)?.label ?? symbol);
      c.setSymbol({ ticker, pricePrecision: info ? 2 : precision, volumePrecision: 2 });
      c.setPeriod(PERIOD[interval]);
      c.setDataLoader({
        getBars: async ({ type, timestamp, callback }) => {
          if (!current()) return; // carga de uma configuração antiga: ignora
          if (type === "backward") return callback([], false);
          if (type === "init" && first) {
            const data = first;
            first = null;
            callback(data, { forward: more, backward: false });
            // Zoom e posição salvos deste par/tempo (largura das velas e vela da borda direita).
            if (want) {
              c.setBarSpace(want.barSpace);
              if (want.to !== null) {
                alignTo(c, want);
                // De novo depois que a escala de preço for aplicada (a largura do eixo pode mudar).
                pendingAlign.current = want;
              }
              pendingY.current = want.y ?? null;
            }
            fitOnce(c);
            shown.current = { symbol, interval };
            requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => (restoring.current = false))));
            return;
          }
          try {
            const end = type === "forward" && timestamp ? timestamp - 1 : null;
            const data = await loadCandles(symbol, interval, end);
            if (!current()) return;
            callback(data, { forward: data.length === LIMIT, backward: false });
          } catch (e) {
            if (!current()) return;
            cb.current.onError(e instanceof Error ? e.message : "Preços indisponíveis");
            callback([], false);
          }
        },
        subscribeBar: ({ callback }) => {
          clearInterval(poll);
          // Séries de mercado são diárias (cache de 10 min no servidor): sem atualização a cada 15 s.
          if (isMarketId(symbol)) return;
          poll = setInterval(async () => {
            try {
              const data = await loadCandles(symbol, interval, null, 2);
              if (!current()) return;
              // As duas últimas: fecha a vela anterior com os valores finais e atualiza a atual.
              const last = c.getDataList().at(-1)?.timestamp ?? 0;
              for (const bar of data) if (bar.timestamp >= last) callback(bar);
            } catch {}
          }, POLL_MS);
        },
        unsubscribeBar: () => clearInterval(poll),
      });
    })();
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.symbol, pane.interval]);

  // Tipo de gráfico e escala. "logarithm" usa o eixo próprio (log10 do preço, arrastar sem distorcer).
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    // Instrumentos de mercado só têm um valor por dia: sempre linha/área (velas seriam inventadas).
    const lineOnly = isMarketId(pane.symbol);
    // Footprint ligado: vela vazada (contorno e pavio), para o fluxo por preço aparecer dentro dela.
    const type = lineOnly ? "area" : pane.chartType === "candle" ? (pane.footprint ? "candle_stroke" : "candle_solid") : pane.chartType === "ohlc" ? "ohlc" : "area";
    c.setStyles({
      candle: {
        type,
        area: { backgroundColor: pane.chartType === "line" ? [{ offset: 0, color: "#00000000" }, { offset: 1, color: "#00000000" }] : STYLES.candle.area.backgroundColor },
      },
    });
    c.overrideYAxis({ paneId: "candle_pane", name: pane.scale === "logarithm" ? LOG_AXIS : pane.scale });
    fitOnce(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.chartType, pane.scale, pane.symbol, pane.footprint]);

  // Botão A/N: A liga o ajuste automático na hora (reenquadra os dados visíveis); N congela o enquadramento atual.
  useEffect(() => {
    autoScale.current = pane.autoScale === true;
    const c = chart.current;
    if (!c) return;
    if (autoScale.current) {
      priceAxis(c)?.setAutoCalcTickFlag(true);
      c.resize();
    } else freezePrice(c);
  }, [pane.autoScale]);

  // Legenda da vela (Time/Open/High/Low/Close/Volume): valores só com o cursor sobre uma vela que existe
  // (fora da área do gráfico, ou à frente da última vela, ficam "Ø" — nada congelado); a linha some se desativada.
  // Seta "^"/"v" ao lado do título: recolhe/mostra as legendas dos indicadores.
  useEffect(() => {
    view.current = { collapsed: !!pane.legendCollapsed, showOhlc: pane.showOhlc !== false, interval: pane.interval };
    const c = chart.current;
    if (!c) return;
    const collapsed = !!pane.legendCollapsed;
    c.setStyles({
      candle: {
        tooltip: {
          features: [{ ...feature("collapse", collapsed ? CHEVRON.down : CHEVRON.up), position: "middle" }],
          legend: {
            template: (data: { current?: KLineData | null }) => {
              if (!view.current.showOhlc) return [];
              const ch = cursorOf(chart.current);
              const n = chart.current?.getDataList().length ?? 0;
              const k = data.current;
              const inside = !!k && !!ch?.paneId && typeof ch.realDataIndex === "number" && ch.realDataIndex >= 0 && ch.realDataIndex < n;
              const p = chart.current?.getSymbol()?.pricePrecision ?? 2;
              const num = (v: number | undefined) => (inside && typeof v === "number" ? formatValue(v, p, false) : EMPTY);
              return [
                { title: "Time: ", value: inside && k ? formatBarTime(k.timestamp, view.current.interval) : EMPTY },
                { title: "Open: ", value: num(k?.open) },
                { title: "High: ", value: num(k?.high) },
                { title: "Low: ", value: num(k?.low) },
                { title: "Close: ", value: num(k?.close) },
                { title: "Volume: ", value: inside && typeof k?.volume === "number" ? formatValue(k.volume, 2, true) : EMPTY },
              ];
            },
          },
        },
      },
    } as never);
  }, [pane.legendCollapsed, pane.showOhlc, pane.interval]);

  // ---------- Mapa de liquidações e perfil lateral (botões próprios) ----------
  // Camadas internas (fora da lista de indicadores e das legendas). O open interest do perpétuo é buscado uma vez por
  // par/tempo e entregue às duas. Com o perfil lateral ligado, o gráfico ganha espaço à direita (a última vela não
  // fica atrás da faixa).
  const liqOi = useRef<{ key: string; from: number; data: { oi: [number, number][]; status?: string; source?: string } } | null>(null);
  const sideBase = useRef<number | null>(null);
  /** Largura da faixa lateral: a salva no gráfico ou a que está sendo arrastada agora. */
  const sideWidth = useRef(pane.sideWidth ?? SIDE_WIDTH);
  const [sideDragging, setSideDragging] = useState(false);
  /** Arraste da borda da faixa lateral em andamento: ponto inicial e largura inicial. */
  const sideDrag = useRef<{ x: number; width: number } | null>(null);
  const sideHandle = useRef<HTMLDivElement>(null);
  /** Cores atuais do perfil lateral (as do gráfico, de versões antigas, ou as da conta), lidas pelo laço de desenho. */
  const sideColorsNow = pane.sideColors ?? sideColorsDefault;
  const sideColors = useRef(sideColorsNow);
  useEffect(() => {
    sideColors.current = sideColorsNow;
  }, [sideColorsNow]);
  /** Perfil integrado ao gráfico (lido pelo laço de desenho). */
  const sideIntegratedRef = useRef(!!pane.sideIntegrated);
  useEffect(() => {
    sideIntegratedRef.current = !!pane.sideIntegrated;
  }, [pane.sideIntegrated]);
  /** Perfil lateral selecionado (clique numa barra): minibarra com as cores; `open` = seletor aberto. */
  const [sideSelected, setSideSelected] = useState<{ open: "buy" | "sell" | null; left: number; top: number; width: number; height: number; right: number } | null>(null);
  const sidePress = useRef<{ x: number; y: number } | null>(null);
  const sideBar = useRef<HTMLDivElement>(null);
  /** Delta Horizontal selecionado (clique numa barra): minibarra com cores, encaixe e largura. */
  const [deltaSelected, setDeltaSelected] = useState<{ open: "pos" | "neg" | null; left: number; top: number; width: number; height: number; right: number } | null>(null);
  const deltaBar = useRef<HTMLDivElement>(null);
  const deltaHandle = useRef<HTMLDivElement>(null);
  const [deltaDragging, setDeltaDragging] = useState(false);
  useEffect(() => {
    if (!deltaSelected) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || deltaBar.current?.contains(t) || deltaHandle.current?.contains(t) || t.closest?.("[role=menu]")) return;
      const r = el.current?.getBoundingClientRect();
      if (r && e.clientX - r.left >= deltaSelected.left && el.current?.contains(t)) return;
      setDeltaSelected(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [deltaSelected]);
  // Clicar fora do perfil e da minibarra (e fora do seletor de cor aberto) tira a seleção.
  useEffect(() => {
    if (!sideSelected) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || sideBar.current?.contains(t) || t.closest?.("[role=menu]")) return;
      const r = el.current?.getBoundingClientRect();
      if (r && e.clientX - r.left >= sideSelected.left && el.current?.contains(t)) return;
      setSideSelected(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [sideSelected]);
  const sideCanvas = useRef<HTMLCanvasElement>(null);
  /** Posição da faixa lateral dentro do gráfico (para a dica do mouse). */
  const sideBox = useRef<{ left: number; top: number } | null>(null);
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const MAP_ID = "bh_liq_map";
    if (!sideDrag.current) sideWidth.current = pane.sideWidth ?? SIDE_WIDTH;
    const key = `${pane.symbol}|${pane.interval}`;
    const current = liqOi.current?.key === key ? liqOi.current.data : { oi: [], status: "Carregando..." };
    const exists = c.getIndicators({ id: MAP_ID }).length > 0;
    if (pane.liqMap && !exists) {
      c.createIndicator(
        {
          id: MAP_ID,
          name: LIQ_MAP,
          // Atrás das velas, como nos mapas de liquidação usuais.
          zLevel: -1,
          paneId: "candle_pane",
          extendData: current,
          createTooltipDataSource: () => ({ name: "", calcParamsText: "", legends: [], features: [] }),
        } as never,
        true,
      );
    } else if (!pane.liqMap && exists) c.removeIndicator({ id: MAP_ID });
    // O open interest só serve ao mapa (o perfil lateral é de volume, com as próprias velas).
    if (!pane.liqMap) return;
    // Histórico de open interest desde a 1ª vela carregada; ao rolar para trás (velas mais antigas), busca de novo.
    let cancelled = false;
    let busy = false;
    let failed = false;
    const apply = (from: number, data: { oi: [number, number][]; status?: string; source?: string }) => {
      liqOi.current = { key, from, data };
      if (c.getIndicators({ id: MAP_ID }).length) c.overrideIndicator({ id: MAP_ID, name: LIQ_MAP, extendData: data });
    };
    const check = () => {
      const list = c.getDataList();
      const first = list[0]?.timestamp;
      if (cancelled || busy || failed || typeof first !== "number") return;
      // Logo depois de trocar o tempo, o gráfico ainda mostra as velas do tempo anterior: espera as do tempo novo
      // (senão o histórico seria pedido a partir da data errada).
      const expected = BAR_MS[pane.interval];
      const step = list.length > 2 ? list[list.length - 1].timestamp - list[list.length - 2].timestamp : NaN;
      if (expected && Number.isFinite(step) && (step < expected * 0.5 || step > expected * 1.6)) return;
      const have = liqOi.current?.key === key ? liqOi.current.from : null;
      if (have !== null && have <= first) return;
      busy = true;
      fetch(`/api/liq-oi?${new URLSearchParams({ symbol: pane.symbol, interval: pane.interval, from: String(Math.max(Date.UTC(2017, 0, 1), first)) })}`)
        .then(async (res) => {
          const body = await res.json().catch(() => null);
          if (!res.ok || !Array.isArray(body?.points)) throw new Error(body?.error ?? "indisponível");
          if (!cancelled) apply(first, { oi: body.points as [number, number][], source: body.source === "bybit" ? "bybit" : "binance" });
        })
        .catch((e) => {
          if (cancelled) return;
          failed = true;
          const msg = e instanceof Error ? e.message : "indisponível";
          apply(first, { oi: [], status: `Sem dados: ${msg}` });
          cb.current.onError(`Mapa de liquidações: ${msg}`);
        })
        .finally(() => {
          busy = false;
        });
    };
    check();
    const timer = setInterval(check, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pane.liqMap, pane.sideProfile, pane.sideWidth, pane.sideIntegrated, pane.symbol, pane.interval]);

  // ---------- Espaço à direita: perfil lateral e Delta Horizontal ----------
  // Ordem: gráfico → perfil lateral → Delta Horizontal → eixo de preço. Isolado = painel próprio (o gráfico reserva o
  // espaço, a última vela não fica atrás dele); integrado = barras sobre a borda direita do gráfico, atrás das velas.
  // Perfil isolado com Delta integrado: o espaço do Delta também fica reservado (ele não pode ficar entre o painel do
  // perfil e o eixo por cima das velas), mas sem fundo.
  const deltaW = layerStyles?.delta?.width ?? DELTA_DEFAULTS.width;
  const deltaWidth = useRef(deltaW);
  const deltaDrag = useRef<{ x: number; width: number } | null>(null);
  const deltaOn = useRef(!!pane.deltaProfile);
  const reserveFor = useRef((vpW: number, dW: number) => vpW * 0 + dW * 0);
  useEffect(() => {
    deltaOn.current = !!pane.deltaProfile;
    if (!deltaDrag.current) deltaWidth.current = deltaW;
    reserveFor.current = (vpW: number, dW: number) => {
      const vpIso = !!pane.sideProfile && !pane.sideIntegrated;
      return (vpIso ? vpW : 0) + (pane.deltaProfile && (!pane.deltaIntegrated || vpIso) ? dW : 0);
    };
  });
  const applyReserve = (c: Chart, vpW: number, dW: number) => {
    const r = reserveFor.current(vpW, dW);
    if (r > 0) {
      if (sideBase.current === null) sideBase.current = c.getOffsetRightDistance();
      c.setOffsetRightDistance(sideBase.current + r);
    } else if (sideBase.current !== null) {
      c.setOffsetRightDistance(sideBase.current);
      sideBase.current = null;
    }
  };
  useEffect(() => {
    const c = chart.current;
    if (c) applyReserve(c, sideWidth.current, deltaWidth.current);
  }, [pane.sideProfile, pane.sideIntegrated, pane.deltaProfile, pane.deltaIntegrated, pane.sideWidth, deltaW]);

  // ---------- Camadas de volume e fluxo (botões próprios, independentes) ----------
  const flowSub = useRef<{ key: string; subId: string; bars: KLineData[]; from: number; to: number; at: number } | null>(null);
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const want: Record<string, boolean> = {
      [SIDE_INT]: !!pane.sideProfile && !!pane.sideIntegrated,
      [MARKS]: !!pane.sideMarks,
      [DELTA_PROF]: !!pane.deltaProfile,
      [FOOTPRINT]: !!pane.footprint,
    };
    // Atrás das velas: perfil integrado (mais ao fundo) e Delta Horizontal. Por cima: marcações e Footprint.
    const z: Record<string, number> = { [SIDE_INT]: -3, [DELTA_PROF]: -2, [MARKS]: 900, [FOOTPRINT]: 800 };
    const dW = pane.deltaProfile ? deltaWidth.current : 0;
    const reserve = (pane.sideProfile ? (pane.sideWidth ?? SIDE_WIDTH) : 0) + dW;
    const extend = (name: string): Record<string, unknown> => {
      const sub = flowSub.current?.key === `${pane.symbol}|${pane.interval}` ? flowSub.current : null;
      if (name === SIDE_INT) return { width: pane.sideWidth ?? SIDE_WIDTH, buy: sideColorsNow?.buy, sell: sideColorsNow?.sell, shift: dW };
      if (name === MARKS) return { ...layerStyles?.marks, reserve };
      if (name === DELTA_PROF) return { ...layerStyles?.delta, width: deltaWidth.current, integrated: !!pane.deltaIntegrated && !(pane.sideProfile && !pane.sideIntegrated), sub: sub?.bars, subId: sub?.subId };
      return { style: layerStyles?.footprint, sub: sub?.bars, subId: sub?.subId, barMs: BAR_MS[pane.interval] };
    };
    for (const name of [SIDE_INT, MARKS, DELTA_PROF, FOOTPRINT]) {
      const id = `bh_${name}`;
      const exists = c.getIndicators({ id }).length > 0;
      if (want[name] && !exists)
        c.createIndicator({ id, name, zLevel: z[name], paneId: "candle_pane", extendData: extend(name), createTooltipDataSource: () => ({ name: "", calcParamsText: "", legends: [], features: [] }) } as never, true);
      else if (want[name]) c.overrideIndicator({ id, name, extendData: extend(name) });
      else if (exists) c.removeIndicator({ id });
    }
    if (!pane.deltaProfile && !pane.footprint) return;
    // Velas menores do trecho visível (compras/vendas agressoras reais), pedidas aos poucos e guardadas por par/tempo.
    let cancelled = false;
    let busy = false;
    const key = `${pane.symbol}|${pane.interval}`;
    const barMs = BAR_MS[pane.interval];
    const push = () => {
      for (const name of [DELTA_PROF, FOOTPRINT]) {
        const id = `bh_${name}`;
        if (c.getIndicators({ id }).length) c.overrideIndicator({ id, name, extendData: extend(name) });
      }
    };
    const check = async () => {
      if (cancelled || busy || !barMs) return;
      const list = c.getDataList();
      if (list.length < 2) return;
      const step = list[list.length - 1].timestamp - list[list.length - 2].timestamp;
      if (step < barMs * 0.5 || step > barMs * 1.6) return;
      const r = c.getVisibleRange();
      const a = list[Math.max(0, r.from)]?.timestamp;
      const zIdx = Math.min(list.length - 1, r.to - 1);
      const zTs = list[zIdx]?.timestamp;
      if (typeof a !== "number" || typeof zTs !== "number") return;
      const sub = pickSubInterval(barMs, zTs + barMs - a);
      if (!sub) {
        flowSub.current = { key, subId: "none", bars: [], from: a, to: zTs, at: Date.now() };
        return push();
      }
      const cur = flowSub.current?.key === key && flowSub.current.subId === sub.id ? flowSub.current : null;
      const live = zIdx >= list.length - 1;
      // Já cobre o trecho nas duas pontas (e, no fim do gráfico, foi atualizado há menos de 30 s): nada a fazer.
      if (cur && cur.from <= a && cur.to >= zTs && (!live || Date.now() - cur.at < 30_000)) return;
      busy = true;
      try {
        const bars = new Map<number, KLineData>((cur?.bars ?? []).map((b) => [b.timestamp, b]));
        let end: number | null = live ? null : zTs + barMs;
        for (let page = 0; page < 6; page++) {
          const got = await loadCandles(pane.symbol, sub.id as ChartInterval, end, 1000);
          if (cancelled) return;
          for (const b of got) bars.set(b.timestamp, b);
          const oldest = got[0]?.timestamp;
          if (!got.length || typeof oldest !== "number" || oldest <= a || (cur && cur.from <= a && oldest <= cur.to)) break;
          end = oldest - 1;
        }
        const sorted = [...bars.values()].sort((x, y) => x.timestamp - y.timestamp).slice(-12000);
        flowSub.current = { key, subId: sub.id, bars: sorted, from: Math.max(sorted[0]?.timestamp ?? a, Math.min(a, cur?.from ?? a)), to: Math.max(zTs, cur?.to ?? zTs), at: Date.now() };
        push();
      } catch (e) {
        if (!cancelled) cb.current.onError(`Fluxo por preço: ${e instanceof Error ? e.message : "indisponível"}`);
        cancelled = true;
      } finally {
        busy = false;
      }
    };
    void check();
    const timer = setInterval(() => void check(), 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pane.sideProfile, pane.sideIntegrated, pane.sideMarks, pane.deltaProfile, pane.deltaIntegrated, pane.footprint, pane.sideWidth, pane.symbol, pane.interval, layerStyles, sideColorsNow]);

  // Perfil de volume lateral: tela própria colada à direita da área do preço, por cima de tudo, com o cálculo da
  // ferramenta Faixa Fixa sobre as velas e a faixa de preço visíveis. Redesenha só quando muda algo (velas, janela
  // visível, escala de preço ou tamanho).
  useEffect(() => {
    if (!pane.sideProfile) {
      sideBox.current = null;
      return;
    }
    let raf = 0;
    let lastKey = "";
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const c = chart.current;
      const cv = sideCanvas.current;
      if (!c) return;
      const size = c.getSize("candle_pane", "main");
      if (!size || size.width <= 0 || size.height <= 0) return;
      const W = Math.min(sideWidth.current, size.width * 0.6);
      const H = size.height;
      const [top, bottom] = c.convertFromPixel([{ y: 0 }, { y: H }], { paneId: "candle_pane" }) as { value?: number }[];
      const hi = top?.value ?? NaN;
      const lo = bottom?.value ?? NaN;
      const data = c.getDataList();
      const last = data[data.length - 1];
      // Velas visíveis (o mesmo intervalo usado pelos perfis de volume da faixa visível).
      const range = c.getVisibleRange();
      const from = Math.max(0, range.from);
      const to = Math.min(data.length - 1, range.to - 1);
      const colors = sideColors.current;
      const key = [deltaOn.current ? deltaWidth.current : 0, size.left, size.top, size.width, W, H, lo, hi, data.length, last?.timestamp, last?.close, from, to, colors?.buy, colors?.sell, sideIntegratedRef.current].join("|");
      if (key === lastKey) return;
      lastKey = key;
      const dEff = deltaOn.current ? deltaWidth.current : 0;
      const left = size.left + size.width - dEff - W;
      sideBox.current = { left, top: size.top };
      const dh = deltaHandle.current;
      if (dh) {
        dh.style.left = `${size.left + size.width - dEff - 4}px`;
        dh.style.top = `${size.top}px`;
        dh.style.height = `${H}px`;
      }
      const handleEl = sideHandle.current;
      if (handleEl) {
        handleEl.style.left = `${left - 4}px`;
        handleEl.style.top = `${size.top}px`;
        handleEl.style.height = `${H}px`;
      }
      // Integrado: a camada de dentro do gráfico desenha (atrás das velas); a tela própria fica vazia.
      if (!cv) return;
      if (sideIntegratedRef.current) {
        cv.getContext("2d")?.clearRect(0, 0, cv.width, cv.height);
        return;
      }
      cv.style.left = `${left}px`;
      cv.style.top = `${size.top}px`;
      const handle = sideHandle.current;
      if (handle) {
        handle.style.left = `${left - 4}px`;
        handle.style.top = `${size.top}px`;
        handle.style.height = `${H}px`;
      }
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
      const dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSideProfile(ctx, {
        integrated: sideIntegratedRef.current,
        key: "bh_side",
        width: W,
        height: H,
        lo,
        hi,
        from,
        to,
        data,
        buyColor: colors?.buy,
        sellColor: colors?.sell,
        yOf: (price) => (c.convertToPixel({ value: price }, { paneId: "candle_pane" }) as { y?: number }).y ?? 0,
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pane.sideProfile, pane.symbol, pane.interval]);

  // Dica do mouse: perfil lateral (faixa de preço e volume) ou mapa de liquidações (data, preço e liquidez estimada).
  const [tip, setTip] = useState<{ id: string; x: number; y: number; side: "left" | "right"; title: string; lines: [string, string][] } | null>(null);

  // Indicadores: recria quando a lista muda (sem mexer nas comparações).
  const indicatorIds = useRef<string[]>([]);
  const indicatorKey = JSON.stringify(pane.indicators);
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    for (const id of indicatorIds.current) c.removeIndicator({ id });
    indicatorIds.current = [];
    indicatorState.current.clear();
    pane.indicators.forEach((ind, index) => {
      const main = ind.pane === "main";
      // Volume movido para o gráfico de preço: desenhado na faixa inferior, com escala própria.
      const volMain = ind.name === "VOL" && main;
      const created = c.createIndicator(
        {
          ...(ind.id ? { id: ind.id } : {}),
          name: volMain ? "VOL_MAIN" : ind.name,
          calcParams: ind.params,
          visible: ind.visible !== false,
          zLevel: index,
          ...(indicatorExtend(ind) ? { extendData: indicatorExtend(ind) } : {}),
          // RSI da biblioteca: acrescenta as linhas de referência e deixa o resto como está.
          ...(ind.name === "RSI" ? { draw: (p: Parameters<typeof drawLevels>[0]) => drawLevels(p), minValue: 0, maxValue: 100 } : {}),
          ...(main ? { paneId: "candle_pane" } : ind.paneKey ? { paneId: `p_${ind.paneKey}` } : {}),
          // Legenda: nome, parâmetros e valores podem ser escondidos; ícones aparecem com o mouse no painel.
          createTooltipDataSource: ({ indicator, crosshair }) => {
            // Legendas recolhidas pela seta "^" (só as do gráfico de preço).
            if (view.current.collapsed && indicator.paneId === "candle_pane") return { name: "", calcParamsText: "", legends: [], features: [] };
            const legend = ind.legend ?? {};
            const data = indicator.result as Record<string, unknown>[];
            const row = data[crosshair.dataIndex ?? data.length - 1] ?? {};
            const lineColors = (indicator.styles?.lines ?? []).map((l) => l?.color);
            let lineIndex = -1;
            const volBar = volMain ? chart.current?.getDataList()[crosshair.dataIndex ?? 0] : undefined;
            const legends =
              legend.values === false
                ? []
                : volMain
                  ? [{ title: { text: "Volume: ", color: "#a1a1aa" }, value: { text: formatValue(volBar?.volume, 2, true), color: "#a1a1aa" } }]
                  : indicator.figures.flatMap((f) => {
                    const isLine = (f.type ?? "line") === "line";
                    if (isLine) lineIndex++;
                    if (!f.title || ind.styles?.[f.key]?.visible === false) return [];
                    // Volume Delta: só a representação escolhida (colunas ou linha) aparece na legenda.
                    if (ind.name === "DELTA" && (f.key === "deltaLine") !== (ind.options?.mode === "line")) return [];
                    const color = isLine ? (lineColors[lineIndex] ?? DEFAULT_LINE_COLORS[lineIndex % DEFAULT_LINE_COLORS.length]) : "#a1a1aa";
                    return [{ title: { text: f.title, color: "#a1a1aa" }, value: { text: formatValue(row[f.key], indicator.precision, indicator.shouldFormatBigNumber), color } }];
                  });
            // Ícones só com o mouse sobre este gráfico (discretos). Não dá para usar o painel do cursor:
            // sobre o próprio ícone a biblioteca não informa painel e eles sumiriam antes do clique.
            const r = el.current?.getBoundingClientRect();
            const m = mouse.current;
            const hovering = !!r && m.x >= r.left && m.x <= r.right && m.y >= r.top && m.y <= r.bottom;
            return {
              // Sem nome nem valores a biblioteca não desenha a linha (e os ícones sumiriam): fica um espaço.
              name: legend.name === false ? (legends.length ? "" : " ") : indicator.shortName,
              calcParamsText: volMain || legend.params === false || !indicator.calcParams.length ? "" : `(${indicator.calcParams.join(",")})`,
              legends,
              features: hovering
                ? [
                    feature(indicator.visible ? "hide" : "show", indicator.visible ? ICON_PATHS.hide : ICON_PATHS.show),
                    feature("settings", ICON_PATHS.settings),
                    feature("remove", ICON_PATHS.remove),
                    feature("more", ICON_PATHS.more),
                    // Só o Volume: seta para levar ao gráfico de preço (↑) ou de volta ao painel próprio (↓).
                    ...(ind.name === "VOL" ? [feature(main ? "volDown" : "volUp", main ? ARROW_PATHS.down : ARROW_PATHS.up)] : []),
                    // Favorito (lista de indicadores favoritos da conta): estrela vazia cinza / cheia roxa.
                    favorites.current.includes(ind.name)
                      ? { ...feature("unfavorite", ICON_PATHS.star), content: { path: ICON_PATHS.star, style: "fill" as const, lineWidth: 1 }, color: "#8b7cf6", activeColor: "#a78bfa" }
                      : feature("favorite", ICON_PATHS.star),
                  ]
                : [],
            };
          },
        },
        main || !!ind.paneKey,
      );
      if (!created) return;
      indicatorIds.current.push(created);
      indicatorState.current.set(created, ind);
      // Estilo por série (cor, espessura, traço, visível), na ordem das linhas do indicador;
      // séries sem escolha usam o padrão do indicador (ex.: cores e traços do MA Ribbon NEO).
      const defaults = DEFAULT_SERIES[ind.name];
      if ((ind.styles && Object.keys(ind.styles).length) || defaults) {
        const [live] = c.getIndicators({ id: created });
        const lines: Record<string, unknown>[] = [];
        let j = 0;
        for (const f of live?.figures ?? []) {
          if ((f.type ?? "line") !== "line") continue;
          const def = defaults?.[j] ?? {};
          const st = { ...def, ...ind.styles?.[f.key] };
          lines.push({
            color: st.visible === false ? "#00000000" : (st.color ?? DEFAULT_LINE_COLORS[j % DEFAULT_LINE_COLORS.length]),
            size: st.size ?? 1,
            style: st.style && st.style !== "solid" ? "dashed" : "solid",
            dashedValue: dashOf(st.style),
            smooth: false,
          });
          j++;
        }
        if (lines.length) c.overrideIndicator({ id: created, name: ind.name, styles: { lines } as never });
      }
      // Heatmap de liquidações: busca o open interest do perpétuo e entrega ao indicador.
      // Bull Market Support Band (velas semanais) e Pi Cycle (velas diárias): calculados no tempo próprio do
      // indicador, qualquer que seja o tempo do gráfico; cada valor vale a partir do fechamento da vela que o gerou.
      if (ind.name === "BMSB" || ind.name === "PI_CYCLE") {
        const weekly = ind.name === "BMSB";
        const [pA, pB] = ind.params.length >= 2 ? ind.params : weekly ? [20, 21] : [111, 350];
        loadCandles(pane.symbol, weekly ? "1w" : "1d", null, 1000)
          .then((k) => {
            const closes = k.map((b) => b.close);
            const step = (weekly ? 7 : 1) * 86_400_000;
            const a = sma(closes, Math.round(pA));
            const b = weekly ? ema(closes, Math.round(pB)) : sma(closes, Math.round(pB)).map((v) => (v === null ? null : v * 2));
            const series = k.map((bar, i) => ({ t: bar.timestamp + step, x: a[i], y: b[i] }));
            // Junta com as opções do indicador (ex.: cores das áreas da Bull Market Support Band), sem perdê-las.
            const extendData = weekly
              ? { ...indicatorExtend(ind), weekly: series.map((s) => ({ t: s.t, sma: s.x, ema: s.y })) }
              : { ...indicatorExtend(ind), daily: series.map((s) => ({ t: s.t, fast: s.x, slow: s.y })) };
            chart.current?.overrideIndicator({ id: created, name: ind.name, extendData });
          })
          .catch((e) => cb.current.onError(`${ind.name === "BMSB" ? "Bull Market Support Band" : "Pi Cycle"}: ${e instanceof Error ? e.message : "indisponível"}`));
      }
      if (ind.name === "LIQ_HEATMAP") {
        fetch(`/api/open-interest?${new URLSearchParams({ symbol: pane.symbol, interval: pane.interval })}`)
          .then(async (res) => {
            if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "indisponível");
            const oi = (await res.json()) as [number, number][];
            chart.current?.overrideIndicator({ id: created, name: "LIQ_HEATMAP", extendData: { oi } });
          })
          .catch((e) => cb.current.onError(`Liquidações: ${e instanceof Error ? e.message : "indisponível"}`));
      }
    });
    fitPanes(c, el.current?.clientHeight ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicatorKey, pane.symbol, pane.interval]);

  // Comparações: busca os dados (par da Binance no mesmo tempo, série do FRED ou on-chain) e desenha as linhas.
  // Sobre o preço (começando no mesmo ponto) ou em painel separado, conforme a escolha de cada uma.
  const compareIds = useRef<string[]>([]);
  const compareKey = JSON.stringify(pane.compares);
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    let cancelled = false;
    for (const id of compareIds.current) c.removeIndicator({ id });
    compareIds.current = [];
    compareIndex.current.clear();
    // Busca todas juntas, mas cria na ordem da lista (a legenda fica sempre na mesma ordem).
    const release: (() => void)[] = [];
    const turns = pane.compares.map(() => new Promise<void>((r) => release.push(r)));
    pane.compares.forEach(async (cmp, slot) => {
      try {
        let points: Point[];
        let label: string;
        let reference: number | undefined;
        let dated = false;
        const sub = compareDisplay(cmp) === "sub";
        const scale = compareScale(cmp, pane.symbol);
        if (cmp.kind === "onchain") {
          const info = onchainInfo(cmp.id);
          const res = await fetch(`/api/onchain?${new URLSearchParams({ id: cmp.id })}`);
          const body = (await res.json().catch(() => null)) as { points?: Point[]; source?: string; stale?: boolean; error?: string } | null;
          if (!res.ok || !body?.points) throw new Error(body?.error ?? "Dados indisponíveis");
          points = body.points;
          label = `${info?.short ?? cmp.id}${body.source === "calculo" ? " (cálculo)" : ""}${body.stale ? " · guardado" : ""}`;
          // Linha de referência (ex.: SOPR = 1) no painel próprio.
          reference = sub ? info?.reference : undefined;
          dated = true;
        } else if (cmp.kind === "market") {
          // Capitalização/dominância: pontos diários reais (o valor de cada dia, sem interpolar).
          const res = await fetch(`/api/market?${new URLSearchParams({ id: cmp.id })}`);
          const body = (await res.json().catch(() => null)) as { points?: Point[]; error?: string } | null;
          if (!res.ok || !body?.points) throw new Error(body?.error ?? "Dados indisponíveis");
          points = body.points;
          label = marketInfo(cmp.id)?.short ?? cmp.id;
          dated = true;
        } else if (cmp.kind === "pair") {
          const data = await loadCandles(cmp.id, pane.interval, null, 1000);
          points = data.map((k) => [k.timestamp, k.close]);
          label = cmp.id === "PAXGUSDT" ? "Ouro (PAXG)" : (invertedPair(cmp.id)?.label ?? crossPair(cmp.id)?.label ?? cmp.id);
        } else {
          const res = await fetch(`/api/macro?${new URLSearchParams({ id: cmp.id })}`);
          if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Dados indisponíveis");
          points = (await res.json()) as Point[];
          label = MACRO_SERIES.find((m) => m.id === cmp.id)?.label ?? cmp.id;
        }
        if (slot) await turns[slot - 1];
        if (cancelled) return;
        const color = cmp.color ?? COMPARE_COLORS[slot % COMPARE_COLORS.length];
        // Sobre o preço: % (rebase), escala própria encaixada na faixa do preço, ou o valor direto (mesma unidade).
        const kind = sub ? "MACRO" : scale === "price" ? "RAW" : scale === "fit" ? "FIT" : "COMPARE";
        // Valor real da série no cursor (não o valor encaixado/rebase desenhado): a última observação até o horário.
        // On-chain (diário) mostra também a data da observação, sem interpolar.
        const valueAt = (t: number | undefined) => {
          const at = t ?? Date.now();
          let obs: Point | undefined;
          for (let lo = 0, hi = points.length - 1; lo <= hi; ) {
            const mid = (lo + hi) >> 1;
            if (points[mid][0] <= at) {
              obs = points[mid];
              lo = mid + 1;
            } else hi = mid - 1;
          }
          if (!obs) return "n/a";
          const v = formatValue(obs[1], Math.abs(obs[1]) >= 100 ? 2 : 4, dated);
          return dated ? `${v} (${new Date(obs[0]).toLocaleDateString("pt-BR", { timeZone: "UTC" })})` : v;
        };
        const id = c.createIndicator(
          {
            name: `${kind}_${slot}`,
            shortName: label,
            visible: cmp.visible !== false,
            extendData: { label, points, color, ...(reference !== undefined ? { levels: [reference] } : {}) },
            styles: { lines: [{ color, size: cmp.size ?? 1.5, style: cmp.style && cmp.style !== "solid" ? "dashed" : "solid", dashedValue: dashOf(cmp.style), smooth: false }] },
            ...(sub ? {} : { paneId: "candle_pane" }),
            ...(reference !== undefined ? { draw: (p: Parameters<typeof drawLevels>[0]) => drawLevels(p) } : {}),
            // Legenda com os controles (como os indicadores): ocultar, configurar, remover e mover de painel.
            // Oculta: fica só o nome (para mostrar de novo), sem valores.
            createTooltipDataSource: ({ indicator, crosshair }: { indicator: Indicator; crosshair: { timestamp?: number } }) => {
              if (view.current.collapsed && !sub) return { name: "", calcParamsText: "", legends: [], features: [] };
              const r = el.current?.getBoundingClientRect();
              const m = mouse.current;
              const hovering = !!r && m.x >= r.left && m.x <= r.right && m.y >= r.top && m.y <= r.bottom;
              const shown = indicator.visible;
              const text = valueAt(crosshair.timestamp);
              return {
                name: shown ? indicator.shortName : `${indicator.shortName} (oculto)`,
                calcParamsText: "",
                legends: shown ? [{ title: { text: "", color: "#a1a1aa" }, value: { text, color } }] : [],
                features: hovering
                  ? [
                      feature(shown ? "hide" : "show", shown ? ICON_PATHS.hide : ICON_PATHS.show),
                      feature("settings", ICON_PATHS.settings),
                      feature("remove", ICON_PATHS.remove),
                      feature(sub ? "up" : "down", sub ? ARROW_PATHS.up : ARROW_PATHS.down),
                    ]
                  : [],
              };
            },
          } as never,
          !sub,
        );
        if (id) {
          compareIds.current.push(id);
          compareIndex.current.set(id, slot);
        }
        if (sub) fitPanes(c, el.current?.clientHeight ?? 0);
      } catch (e) {
        cb.current.onError(`Comparação ${cmp.id}: ${e instanceof Error ? e.message : "indisponível"}`);
      } finally {
        if (slot) await turns[slot - 1];
        release[slot]();
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareKey, pane.interval, pane.symbol]);

  // Desenhos salvos: aplica ao abrir (depois as mudanças vêm do próprio gráfico).
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    c.removeOverlay();
    meta.current.clear();
    pane.overlays.forEach((o, z) => createFromState(c, o, z));
    // Desenhos antigos ganham id: salva uma vez para guardar os ids.
    if (pane.overlays.some((o) => !o.id)) emitOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      onPointerDown={onActivate}
      onPointerMove={(e) => (mouse.current = { x: e.clientX, y: e.clientY })}
      onPointerLeave={() => (mouse.current = { x: -1, y: -1 })}
      // Com uma ferramenta ativa, um clique "tremido" (5 px ou mais entre apertar e soltar) a biblioteca
      // descartaria; aqui vira um clique no ponto em que o botão foi solto.
      onPointerDownCapture={(e) => {
        // Só cliques no próprio gráfico: barra rápida, menus e seletores (que estão dentro deste componente
        // no React) não podem mexer na escala nem no desenho.
        if (!el.current?.contains(e.target as Node)) return;
        pressAt.current = drawingId.current && e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
        const c = chart.current;
        const box = el.current?.getBoundingClientRect();
        if (!c || !box || e.button !== 0 || drawingId.current) return;
        const x = e.clientX - box.left;
        const y = e.clientY - box.top;
        const inside = (b: { left: number; top: number; width: number; height: number } | null | undefined) =>
          !!b && x >= b.left && x <= b.left + b.width && y >= b.top && y <= b.top + b.height;
        // Escala de tempo: arrastar comprime/expande as velas (zoom horizontal), com a vela mais recente parada
        // no lugar quando está na tela (senão, a borda direita). Navegar no histórico é arrastar o gráfico.
        if (inside(c.getSize("x_axis_pane", "main"))) {
          const n = c.getDataList().length;
          const width = c.getSize("candle_pane", "main")?.width ?? box.width;
          const lastX = n ? (c.convertToPixel({ dataIndex: n - 1 }, { paneId: "candle_pane" }) as { x?: number }).x : undefined;
          const anchor = typeof lastX === "number" && lastX >= 0 && lastX <= width ? lastX : width;
          timeDrag.current = { x: e.clientX, anchor };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          return;
        }
        // Área livre do preço: a escala sai do automático já agora (a biblioteca só move na vertical fora dele);
        // se o arraste for só horizontal, o automático volta ao soltar (modo A). No modo N já está fora dele.
        const axis = priceAxis(c);
        if (!hoverOverlay.current && axis && inside(c.getSize("candle_pane", "main"))) {
          const wasAuto = axis.getAutoCalcTickFlag();
          if (wasAuto) axis.setRange(axis.getRange());
          priceDrag.current = { y: e.clientY, wasAuto };
        }
      }}
      onPointerMoveCapture={(e) => {
        const d = timeDrag.current;
        if (!d) return;
        // Para a direita comprime (afasta), para a esquerda expande (aproxima): ~2× a cada 115 px.
        const dx = e.clientX - d.x;
        if (!dx) return;
        chart.current?.zoomAtCoordinate(Math.exp(-dx * 0.006), { x: d.anchor, y: 0 });
        d.x = e.clientX;
      }}
      onPointerUpCapture={(e) => {
        // Seleção: a barra rápida segue SEMPRE o desenho que a biblioteca tem selecionado. A biblioteca decide no
        // "mouseup" (que vem depois deste "pointerup"); por isso a leitura vai para logo depois deste evento.
        // Assim um clique no vazio fecha a barra no 1º clique, mesmo que a tela tenha marcado a seleção por outro
        // caminho (clique direito, lista de desenhos, Ctrl+D) que a biblioteca não conhecia.
        if (e.button === 0 && el.current?.contains(e.target as Node) && !drawingId.current) {
          const c0 = chart.current;
          setTimeout(() => {
            if (drawingId.current || chart.current !== c0) return;
            cb.current.onSelect(selectedInChart(c0));
          }, 0);
        }
        timeDrag.current = null;
        const pd = priceDrag.current;
        priceDrag.current = null;
        const c = chart.current;
        if (pd?.wasAuto && c && Math.abs(e.clientY - pd.y) < 4) {
          priceAxis(c)?.setAutoCalcTickFlag(true);
          c.resize();
        }
        // Modo A e a pessoa ajustou o preço à mão (arrastou na vertical ou esticou a escala): passa para N,
        // preservando esse enquadramento.
        const axisNow = c ? priceAxis(c) : null;
        if (autoScale.current && axisNow && !axisNow.getAutoCalcTickFlag()) {
          autoScale.current = false;
          cb.current.onAutoScaleChange(false);
        }
        const start = pressAt.current;
        pressAt.current = null;
        if (!start || !drawingId.current || e.button !== 0 || !e.isTrusted) return;
        if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) < 5) return;
        const target = e.target as Element;
        const init = { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY, button: 0 };
        setTimeout(() => {
          target.dispatchEvent(new MouseEvent("mousedown", { ...init, buttons: 1 }));
          target.dispatchEvent(new MouseEvent("mouseup", { ...init, buttons: 0 }));
        }, 0);
      }}
      onMouseMove={(e) => {
        const clear = () => tip && setTip(null);
        if ((!pane.sideProfile && !pane.liqMap && !pane.deltaProfile && !pane.footprint) || !el.current || e.buttons || sideDrag.current) return clear();
        const r = el.current.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const box = sideBox.current;
        // Sobre a faixa lateral: só a dica do perfil.
        if (pane.sideProfile && box && x >= box.left && x < box.left + sideWidth.current) {
          const h = sideHit("bh_side", x - box.left, y - box.top);
          if (!h) return clear();
          const id = `s${h.from}`;
          if (tip?.id !== id || Math.abs(tip.y - y) > 2)
            setTip({ id, x: r.width - x + 12, y, side: "right", title: "Perfil de volume · clique para selecionar e mudar as cores", lines: sideTipLines(h) });
          return;
        }
        const area = chart.current?.getSize("candle_pane", "main");
        if (area && (pane.footprint || pane.deltaProfile)) {
          const fx = x - area.left;
          const fy = y - area.top;
          const fh = pane.footprint ? footHit(fx, fy) : null;
          if (fh) {
            const id = `f${fh.time}|${fh.from}`;
            if (tip?.id !== id)
              setTip({
                id,
                x: x > r.width - 280 ? r.width - x + 14 : x + 14,
                y,
                side: x > r.width - 280 ? "right" : "left",
                title: "Footprint (aproximado)",
                lines: [
                  ["Faixa", `${fh.from.toLocaleString("pt-BR")} – ${fh.to.toLocaleString("pt-BR")}`],
                  ["Compras · vendas agressoras", `${fmtFlow(fh.buy)} · ${fmtFlow(fh.sell)}`],
                  ["Delta do nível", fmtFlow(fh.buy - fh.sell)],
                  ["Vela: delta · volume", `${fmtFlow(fh.candle.delta)} · ${fmtFlow(fh.candle.volume)}`],
                ],
              });
            return;
          }
          const dh = pane.deltaProfile ? deltaHit(fx, fy) : null;
          if (dh) {
            const id = `d${dh.from}`;
            if (tip?.id !== id || Math.abs(tip.y - y) > 2)
              setTip({
                id,
                x: r.width - x + 14,
                y,
                side: "right",
                title: `Delta por preço (${dh.res})`,
                lines: [
                  ["Faixa", `${dh.from.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} – ${dh.to.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`],
                  ["Compras · vendas agressoras", `${fmtFlow(dh.buy)} · ${fmtFlow(dh.sell)}`],
                  ["Delta", fmtFlow(dh.buy - dh.sell)],
                ],
              });
            return;
          }
        }
        const size = pane.liqMap ? area : null;
        const h = size ? liqMapHit(x - size.left, y - size.top) : null;
        if (!h) return clear();
        const id = `m${h.time}|${h.from}`;
        const nearRight = x > r.width - 280;
        if (tip?.id !== id || Math.abs(tip.y - y) > 2)
          setTip({ id, x: nearRight ? r.width - x + 14 : x + 14, y, side: nearRight ? "right" : "left", title: "Liquidações (estimativa)", lines: mapTipLines(h) });
      }}
      onMouseLeave={() => tip && setTip(null)}
      // Clique (sem arrastar) numa barra do perfil lateral: seleciona o perfil e abre a cor daquela parte. Lido na
      // captura do pointerdown/pointerup (antes do gráfico), então o arraste do gráfico não consome o clique.
      onMouseDownCapture={(e) => {
        sidePress.current = { x: e.clientX, y: e.clientY };
      }}
      onClick={(e) => {
        const start = sidePress.current;
        sidePress.current = null;
        if (!pane.sideProfile || !el.current || e.button !== 0) return;
        if (!start || Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 4) return;
        if ((e.target as Element).closest?.("[role=separator],[role=menu],[data-side-bar],button")) return;
        const box = sideBox.current;
        const r = el.current.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const area = chart.current?.getSize("candle_pane", "main");
        if (pane.deltaProfile && area) {
          const dh = deltaHit(x - area.left, y - area.top);
          if (dh) {
            setTip(null);
            setSideSelected(null);
            const left = area.left + area.width - deltaWidth.current;
            setDeltaSelected({ open: null, left, top: area.top, width: deltaWidth.current, height: area.height, right: r.width - left + 8 });
            return;
          }
        }
        if (!box || x < box.left || x >= box.left + sideWidth.current) return;
        const h = sideHit("bh_side", x - box.left, y - box.top);
        if (!h) return;
        setTip(null);
        // Posição da faixa guardada no clique (para o contorno e a minibarra).
        const height = chart.current?.getSize("candle_pane", "main")?.height ?? r.height;
        setDeltaSelected(null);
        setSideSelected({ open: h.part, left: box.left, top: box.top, width: sideWidth.current, height, right: r.width - box.left + 8 });
      }}
      className={`relative h-full min-h-0 w-full rounded-lg border ${active ? "border-[#8b7cf6]" : "border-border"}`}
      data-testid="chart-pane"
    >
      <div ref={el} className="absolute inset-0" />
      {away && (
        <button
          type="button"
          title="Voltar ao tempo atual"
          aria-label="Voltar ao tempo atual"
          onClick={() => chart.current?.scrollToRealTime(250)}
          className="absolute right-20 bottom-9 z-10 grid size-7 place-items-center rounded-md border bg-popover/90 text-muted-foreground shadow hover:text-foreground"
        >
          <svg viewBox="0 0 12 12" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            <path d="M2 2 L6 6 L2 10 M6 2 L10 6 L6 10" />
          </svg>
        </button>
      )}
      {pane.sideProfile && <canvas ref={sideCanvas} aria-label="Perfil de volume lateral" className="pointer-events-none absolute z-[5]" />}
      {pane.sideProfile && (
        // Borda esquerda da faixa lateral: arrastar para a esquerda alarga, para a direita estreita (só o desenho;
        // o cálculo do volume não muda). Fica fora da área do gráfico: os arrastes de zoom/preço não reagem a ela.
        <div
          ref={sideHandle}
          role="separator"
          aria-orientation="vertical"
          aria-label="Largura do perfil lateral"
          aria-valuemin={SIDE_WIDTH_MIN}
          aria-valuemax={SIDE_WIDTH_MAX}
          aria-valuenow={pane.sideWidth ?? SIDE_WIDTH}
          title="Arraste para ajustar a largura do perfil"
          className="group absolute z-[6] w-2 cursor-ew-resize touch-none"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            sideDrag.current = { x: e.clientX, width: sideWidth.current };
            setSideDragging(true);
            setTip(null);
          }}
          onPointerMove={(e) => {
            const d = sideDrag.current;
            const c = chart.current;
            if (!d || !c) return;
            const paneWidth = c.getSize("candle_pane", "main")?.width ?? 0;
            const max = Math.max(SIDE_WIDTH_MIN, Math.min(SIDE_WIDTH_MAX, Math.floor(paneWidth * 0.6)));
            const w = Math.round(Math.max(SIDE_WIDTH_MIN, Math.min(max, d.width + (d.x - e.clientX))));
            if (w === sideWidth.current) return;
            sideWidth.current = w;
            applyReserve(c, w, deltaWidth.current);
          }}
          onPointerUp={(e) => {
            if (!sideDrag.current) return;
            sideDrag.current = null;
            setSideDragging(false);
            e.currentTarget.releasePointerCapture(e.pointerId);
            cb.current.onSideWidthChange?.(sideWidth.current);
          }}
          onPointerCancel={() => {
            sideDrag.current = null;
            setSideDragging(false);
          }}
        >
          <span className={`mx-auto block h-full w-px transition-colors ${sideDragging ? "bg-[#8b7cf6]" : "bg-transparent group-hover:bg-[#8b7cf6]/70"}`} />
        </div>
      )}
      {sideSelected && pane.sideProfile && (
        <>
          {/* Perfil selecionado: contorno discreto em volta da faixa. */}
          <div
            className="pointer-events-none absolute z-[7] rounded-sm ring-1 ring-[#8b7cf6]"
            style={{ left: sideSelected.left, top: sideSelected.top, width: sideSelected.width, height: sideSelected.height }}
          />
          {/* Minibarra do perfil lateral (mesmo visual da barra rápida dos desenhos): só cores; sem mover (é fixo). */}
          <div
            ref={sideBar}
            data-side-bar
            role="toolbar"
            aria-label="Perfil de volume lateral"
            className="absolute z-30 flex items-center gap-1 rounded-lg border bg-popover/95 px-2 py-1 shadow-lg"
            style={{ right: sideSelected.right, top: sideSelected.top + 8 }}
          >
            <span className="px-1 text-xs text-muted-foreground">Perfil de volume</span>
            <ColorPicker
              label="Cor das barras verdes"
              open={sideSelected.open === "buy"}
              onOpenChange={(v) => setSideSelected((s) => s && { ...s, open: v ? "buy" : null })}
              value={sideColorsNow?.buy ?? PROFILE_BUY}
              onChange={(c) => cb.current.onSideColorsChange?.({ ...sideColorsNow, buy: c })}
            />
            <ColorPicker
              label="Cor das barras vermelhas"
              open={sideSelected.open === "sell"}
              onOpenChange={(v) => setSideSelected((s) => s && { ...s, open: v ? "sell" : null })}
              value={sideColorsNow?.sell ?? PROFILE_SELL}
              onChange={(c) => cb.current.onSideColorsChange?.({ ...sideColorsNow, sell: c })}
            />
            {/* Encaixe: ← integra ao gráfico (sem painel próprio); → volta ao painel lateral. Só muda o desenho. */}
            <button
              type="button"
              aria-label={pane.sideIntegrated ? "Voltar para painel lateral" : "Integrar ao gráfico"}
              title={pane.sideIntegrated ? "Voltar para painel lateral" : "Integrar ao gráfico"}
              onClick={() => {
                cb.current.onSideIntegratedChange?.(!pane.sideIntegrated);
                setSideSelected(null);
              }}
              className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-4"
            >
              {pane.sideIntegrated ? <ChevronRight /> : <ChevronLeft />}
            </button>
            <button type="button" aria-label="Fechar" title="Fechar" onClick={() => setSideSelected(null)} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
              ×
            </button>
          </div>
        </>
      )}
      {pane.deltaProfile && (
        // Borda esquerda do Delta Horizontal: arrastar muda só a largura do desenho (o cálculo não muda).
        <div
          ref={deltaHandle}
          role="separator"
          aria-orientation="vertical"
          aria-label="Largura do Delta Horizontal"
          aria-valuenow={Math.round(deltaW)}
          title="Arraste para ajustar a largura do Delta Horizontal"
          className="group absolute z-[6] w-2 cursor-ew-resize touch-none"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            deltaDrag.current = { x: e.clientX, width: deltaWidth.current };
            setDeltaDragging(true);
            setTip(null);
          }}
          onPointerMove={(e) => {
            const d = deltaDrag.current;
            const c = chart.current;
            if (!d || !c) return;
            const paneWidth = c.getSize("candle_pane", "main")?.width ?? 0;
            const w = Math.round(Math.max(60, Math.min(600, paneWidth * 0.5, d.width + (d.x - e.clientX))));
            if (w === deltaWidth.current) return;
            deltaWidth.current = w;
            applyReserve(c, sideWidth.current, w);
            const id = `bh_${DELTA_PROF}`;
            const cur = c.getIndicators({ id })[0];
            if (cur) c.overrideIndicator({ id, name: DELTA_PROF, extendData: { ...(cur.extendData as object), width: w } });
          }}
          onPointerUp={(e) => {
            if (!deltaDrag.current) return;
            deltaDrag.current = null;
            setDeltaDragging(false);
            e.currentTarget.releasePointerCapture(e.pointerId);
            cb.current.onLayerStylesChange?.({ ...layerStyles, delta: { ...layerStyles?.delta, width: deltaWidth.current } });
          }}
          onPointerCancel={() => {
            deltaDrag.current = null;
            setDeltaDragging(false);
          }}
        >
          <span className={`mx-auto block h-full w-px transition-colors ${deltaDragging ? "bg-[#8b7cf6]" : "bg-transparent group-hover:bg-[#8b7cf6]/70"}`} />
        </div>
      )}
      {deltaSelected && pane.deltaProfile && (
        <>
          <div
            className="pointer-events-none absolute z-[7] rounded-sm ring-1 ring-[#8b7cf6]"
            style={{ left: deltaSelected.left, top: deltaSelected.top, width: deltaSelected.width, height: deltaSelected.height }}
          />
          {/* Minibarra do Delta Horizontal (mesmo visual da do perfil lateral). */}
          <div
            ref={deltaBar}
            data-side-bar
            role="toolbar"
            aria-label="Delta Horizontal"
            className="absolute z-30 flex items-center gap-1 rounded-lg border bg-popover/95 px-2 py-1 shadow-lg"
            style={{ right: deltaSelected.right, top: deltaSelected.top + 8 }}
          >
            <span className="px-1 text-xs text-muted-foreground">Delta Horizontal</span>
            <ColorPicker
              label="Cor do delta positivo"
              open={deltaSelected.open === "pos"}
              onOpenChange={(v) => setDeltaSelected((s) => s && { ...s, open: v ? "pos" : null })}
              value={layerStyles?.delta?.pos ?? DELTA_DEFAULTS.pos}
              onChange={(pos) => cb.current.onLayerStylesChange?.({ ...layerStyles, delta: { ...layerStyles?.delta, pos } })}
            />
            <ColorPicker
              label="Cor do delta negativo"
              open={deltaSelected.open === "neg"}
              onOpenChange={(v) => setDeltaSelected((s) => s && { ...s, open: v ? "neg" : null })}
              value={layerStyles?.delta?.neg ?? DELTA_DEFAULTS.neg}
              onChange={(neg) => cb.current.onLayerStylesChange?.({ ...layerStyles, delta: { ...layerStyles?.delta, neg } })}
            />
            <button
              type="button"
              aria-label={pane.deltaIntegrated ? "Voltar para painel lateral" : "Integrar ao gráfico"}
              title={pane.deltaIntegrated ? "Voltar para painel lateral" : "Integrar ao gráfico"}
              onClick={() => {
                cb.current.onDeltaIntegratedChange?.(!pane.deltaIntegrated);
                setDeltaSelected(null);
              }}
              className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-4"
            >
              {pane.deltaIntegrated ? <ChevronRight /> : <ChevronLeft />}
            </button>
            <button type="button" aria-label="Fechar" title="Fechar" onClick={() => setDeltaSelected(null)} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
              ×
            </button>
          </div>
        </>
      )}
      {tip && !sideSelected?.open && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 rounded-md border bg-popover/95 px-2.5 py-1.5 font-mono text-[11px] leading-5 shadow-lg"
          style={{ [tip.side]: tip.x, top: Math.max(4, tip.y - 24) }}
        >
          <div className="mb-0.5 font-sans text-[11px] font-semibold text-muted-foreground">{tip.title}</div>
          {tip.lines.map(([k, v]) => (
            <div key={k}>
              <span className="text-muted-foreground">{k}: </span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
