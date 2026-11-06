"use client";

import { useEffect, useRef, useState } from "react";
import { dispose, init, type Chart, type Indicator, type KLineData, type OverlayCreate, type OverlayMode, type Period } from "klinecharts";
import type { ChartInterval } from "@/lib/charts/params";
import { splitSymbol } from "@/lib/charts/params";
import type { IndicatorState, OverlayState, OverlayStyleState, PaneState, SeriesStyle } from "@/lib/charts/workspace";
import { NEO_COLORS } from "@/lib/charts/drawing";
import { ELLIOTT_LABELS } from "@/lib/charts/workspace";
import { MACRO_SERIES } from "@/lib/charts/macro-ids";
import { onchainInfo } from "@/lib/charts/onchain-ids";
import { compareDisplay, compareScale } from "@/lib/charts/compare";
import type { Point } from "@/lib/charts/macro-math";
import { COMPARE_COLORS, registerChartExtensions } from "./register";
import { LOG_AXIS, type OverlayExtra } from "./overlays";

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
/** Ferramentas cujo dado extra é o texto (as outras guardam extensão, níveis etc.). */
const TEXT_TOOLS = new Set(["simpleAnnotation", "simpleTag"]);
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

async function loadCandles(symbol: string, interval: ChartInterval, end: number | null, limit = LIMIT): Promise<KLineData[]> {
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
  onDrawingChange,
  handleRef,
  children,
}: {
  /** Clique nos ícones da legenda de uma comparação (ocultar, configurar, remover, mover de painel). */
  onCompareAction: (a: CompareAction) => void;
  /** Seta "^" ao lado do título: recolhe/mostra as legendas dos indicadores. */
  onLegendCollapse: (collapsed: boolean) => void;
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
  const cb = useRef({ onOverlays, onError, onSelect, onObjectSettings, onIndicatorAction, onCompareAction, onLegendCollapse, onDrawingChange });
  useEffect(() => {
    cb.current = { onOverlays, onError, onSelect, onObjectSettings, onIndicatorAction, onCompareAction, onLegendCollapse, onDrawingChange };
  });
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
    });
    return () => {
      ro.disconnect();
      dispose(node);
      chart.current = null;
    };
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
    onPressedMoveEnd: () => {
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
        meta.current.set(id, { id, name: tool, points: [], ...(text ? { text } : {}) });
        drawingId.current = id;
        // A ferramenta tem prioridade: o primeiro clique marca o ponto em vez de mover o gráfico.
        c.setScrollEnabled(false);
        cb.current.onDrawingChange(true);
        const z = c.getOverlays().length;
        c.createOverlay({
          id,
          name: tool,
          mode: magnet.current,
          extendData: TEXT_TOOLS.has(tool) ? text : {},
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
        } else for (const i of c.getIndicators()) c.overrideIndicator({ id: i.id, name: i.name, visible: !hidden && indicatorState.current.get(i.id)?.visible !== false });
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
        const copy = createFromState(c, { ...cur, id: newId("d"), visible: true, locked: false }, c.getOverlays().length);
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

    void (async () => {
      // Busca primeiro (para já saber as casas decimais) e só então troca o par no gráfico.
      let first: KLineData[] | null = null;
      try {
        first = await loadCandles(symbol, interval, null);
        if (current()) cb.current.onError(null);
      } catch (e) {
        if (current()) cb.current.onError(e instanceof Error ? e.message : "Preços indisponíveis");
      }
      if (!current()) return;
      const precision = first?.length ? precisionFor(first[first.length - 1].close) : fallback;
      // Par/tempo novo: a escala de preço volta ao ajuste automático.
      priceAxis(c)?.setAutoCalcTickFlag(true);
      c.setSymbol({ ticker: symbol, pricePrecision: precision, volumePrecision: 2 });
      c.setPeriod(PERIOD[interval]);
      c.setDataLoader({
        getBars: async ({ type, timestamp, callback }) => {
          if (!current()) return; // carga de uma configuração antiga: ignora
          if (type === "backward") return callback([], false);
          if (type === "init" && first) {
            const data = first;
            first = null;
            return callback(data, { forward: data.length === LIMIT, backward: false });
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
          poll = setInterval(async () => {
            try {
              const res = await fetch(`/api/candles?${new URLSearchParams({ symbol, interval, limit: "2" })}`);
              if (!res.ok || !current()) return;
              const data = (await res.json()) as KLineData[];
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
    const type = pane.chartType === "candle" ? "candle_solid" : pane.chartType === "ohlc" ? "ohlc" : "area";
    c.setStyles({
      candle: {
        type,
        area: { backgroundColor: pane.chartType === "line" ? [{ offset: 0, color: "#00000000" }, { offset: 1, color: "#00000000" }] : STYLES.candle.area.backgroundColor },
      },
    });
    c.overrideYAxis({ paneId: "candle_pane", name: pane.scale === "logarithm" ? LOG_AXIS : pane.scale });
    priceAxis(c)?.setAutoCalcTickFlag(true);
  }, [pane.chartType, pane.scale]);

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
      const created = c.createIndicator(
        {
          ...(ind.id ? { id: ind.id } : {}),
          name: ind.name,
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
            const legends =
              legend.values === false
                ? []
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
              calcParamsText: legend.params === false || !indicator.calcParams.length ? "" : `(${indicator.calcParams.join(",")})`,
              legends,
              features: hovering
                ? [
                    feature(indicator.visible ? "hide" : "show", indicator.visible ? ICON_PATHS.hide : ICON_PATHS.show),
                    feature("settings", ICON_PATHS.settings),
                    feature("remove", ICON_PATHS.remove),
                    feature("more", ICON_PATHS.more),
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
        } else if (cmp.kind === "pair") {
          const data = await loadCandles(cmp.id, pane.interval, null, 1000);
          points = data.map((k) => [k.timestamp, k.close]);
          label = cmp.id === "PAXGUSDT" ? "Ouro (PAXG)" : cmp.id;
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
        // se o arraste for só horizontal, o automático volta ao soltar.
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
        // Para a direita expande, para a esquerda comprime (~2× a cada 115 px).
        const dx = e.clientX - d.x;
        if (!dx) return;
        chart.current?.zoomAtCoordinate(Math.exp(dx * 0.006), { x: d.anchor, y: 0 });
        d.x = e.clientX;
      }}
      onPointerUpCapture={(e) => {
        timeDrag.current = null;
        const pd = priceDrag.current;
        priceDrag.current = null;
        const c = chart.current;
        if (pd?.wasAuto && c && Math.abs(e.clientY - pd.y) < 4) {
          priceAxis(c)?.setAutoCalcTickFlag(true);
          c.resize();
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
      {children}
    </div>
  );
}
