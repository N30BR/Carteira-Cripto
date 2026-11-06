"use client";

import { useEffect, useRef } from "react";
import { dispose, init, type Chart, type Indicator, type KLineData, type OverlayCreate, type OverlayMode, type Period } from "klinecharts";
import type { ChartInterval } from "@/lib/charts/params";
import { splitSymbol } from "@/lib/charts/params";
import type { IndicatorState, OverlayState, OverlayStyleState, PaneState } from "@/lib/charts/workspace";
import { MACRO_SERIES } from "@/lib/charts/macro-ids";
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
const PRICE_ONLY = new Set(["fixedRangeVolumeProfile", "fibonacciLine"]);
/** Cores padrão das linhas dos indicadores (as mesmas da biblioteca). */
export const DEFAULT_LINE_COLORS = ["#FF9600", "#935EBD", "#2196F3", "#E11D74", "#01C5C4"];

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
  TEXT_TOOLS.has(o.name) ? o.text : ({ extend: o.styles?.extend, levels: o.styles?.levels, rows: o.styles?.rows, valueArea: o.styles?.valueArea } satisfies OverlayExtra);

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
  getFigures: (id: string) => { key: string; title: string; line: boolean; color: string }[];
};

export type IndicatorAction = { id: string; action: string; x: number; y: number };

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
  onDrawingChange,
  handleRef,
  children,
}: {
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
  const cb = useRef({ onOverlays, onError, onSelect, onObjectSettings, onIndicatorAction, onDrawingChange });
  useEffect(() => {
    cb.current = { onOverlays, onError, onSelect, onObjectSettings, onIndicatorAction, onDrawingChange };
  });
  // Estado salvo de cada desenho (estilo no nosso formato), por id.
  const meta = useRef(new Map<string, OverlayState>());
  const drawingId = useRef<string | null>(null);
  const mouse = useRef({ x: 0, y: 0 });
  const pressAt = useRef<{ x: number; y: number } | null>(null);
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
      cb.current.onIndicatorAction({ id: d.indicator.id, action: d.feature.id, ...mouse.current });
    };
    c?.subscribeAction("onIndicatorTooltipFeatureClick", onFeature);
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
        return ind.figures.map((f) => {
          const line = (f.type ?? "line") === "line";
          if (line) j++;
          const color = (line && (ind.styles?.lines?.[j]?.color as string | undefined)) || DEFAULT_LINE_COLORS[Math.max(0, j) % DEFAULT_LINE_COLORS.length];
          return { key: f.key, title: (f.title ?? "").replace(/:\s*$/, ""), line, color: color === "#00000000" ? DEFAULT_LINE_COLORS[Math.max(0, j) % DEFAULT_LINE_COLORS.length] : color };
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
  }, [pane.chartType, pane.scale]);

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
          ...(ind.options?.types ? { extendData: { types: ind.options.types } } : {}),
          ...(main ? { paneId: "candle_pane" } : ind.paneKey ? { paneId: `p_${ind.paneKey}` } : {}),
          // Legenda: nome, parâmetros e valores podem ser escondidos; ícones aparecem com o mouse no painel.
          createTooltipDataSource: ({ indicator, crosshair }) => {
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
      // Estilo por série (cor, espessura, traço, visível), na ordem das linhas do indicador.
      if (ind.styles && Object.keys(ind.styles).length) {
        const [live] = c.getIndicators({ id: created });
        const lines: Record<string, unknown>[] = [];
        let j = 0;
        for (const f of live?.figures ?? []) {
          if ((f.type ?? "line") !== "line") continue;
          const st = ind.styles[f.key] ?? {};
          const dash = st.style === "dashed" ? [6, 4] : st.style === "dotted" ? [1.5, 3] : [2, 2];
          lines.push({
            color: st.visible === false ? "#00000000" : (st.color ?? DEFAULT_LINE_COLORS[j % DEFAULT_LINE_COLORS.length]),
            size: st.size ?? 1,
            style: st.style && st.style !== "solid" ? "dashed" : "solid",
            dashedValue: dash,
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

  // Comparações: busca os dados (par da Binance no mesmo tempo, ou série do FRED) e desenha as linhas.
  // Sobre o preço (começando no mesmo ponto) ou em painel separado, conforme a escolha de cada uma.
  const compareIds = useRef<string[]>([]);
  const compareKey = JSON.stringify(pane.compares);
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    let cancelled = false;
    for (const id of compareIds.current) c.removeIndicator({ id });
    compareIds.current = [];
    pane.compares.forEach(async (cmp, slot) => {
      try {
        let points: Point[];
        let label: string;
        let sub: boolean;
        if (cmp.kind === "pair") {
          const data = await loadCandles(cmp.id, pane.interval, null, 1000);
          points = data.map((k) => [k.timestamp, k.close]);
          label = cmp.id === "PAXGUSDT" ? "Ouro (PAXG)" : cmp.id;
          sub = cmp.display === "sub";
        } else {
          const res = await fetch(`/api/macro?${new URLSearchParams({ id: cmp.id })}`);
          if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Dados indisponíveis");
          points = (await res.json()) as Point[];
          const meta = MACRO_SERIES.find((m) => m.id === cmp.id);
          label = meta?.label ?? cmp.id;
          sub = cmp.display ? cmp.display === "sub" : meta?.pane === "sub";
        }
        if (cancelled) return;
        const color = COMPARE_COLORS[slot % COMPARE_COLORS.length];
        const id = c.createIndicator(
          {
            name: `${sub ? "MACRO" : "COMPARE"}_${slot}`,
            shortName: label,
            extendData: { label, points, color },
            styles: { lines: [{ color, size: 1.5 }] },
            ...(sub ? {} : { paneId: "candle_pane" }),
          },
          !sub,
        );
        if (id) compareIds.current.push(id);
        if (sub) fitPanes(c, el.current?.clientHeight ?? 0);
      } catch (e) {
        cb.current.onError(`Comparação ${cmp.id}: ${e instanceof Error ? e.message : "indisponível"}`);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareKey, pane.interval]);

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
      onPointerDownCapture={(e) => (pressAt.current = drawingId.current && e.button === 0 ? { x: e.clientX, y: e.clientY } : null)}
      onPointerUpCapture={(e) => {
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
      {children}
    </div>
  );
}
