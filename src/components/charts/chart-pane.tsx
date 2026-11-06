"use client";

import { useEffect, useRef } from "react";
import { dispose, init, type Chart, type KLineData, type OverlayMode, type Period } from "klinecharts";
import type { ChartInterval } from "@/lib/charts/params";
import { splitSymbol } from "@/lib/charts/params";
import type { OverlayState, PaneState } from "@/lib/charts/workspace";
import { registerChartExtensions } from "./register";

const PERIOD: Record<ChartInterval, Period> = {
  "1m": { type: "minute", span: 1 },
  "5m": { type: "minute", span: 5 },
  "15m": { type: "minute", span: 15 },
  "1h": { type: "hour", span: 1 },
  "4h": { type: "hour", span: 4 },
  "1d": { type: "day", span: 1 },
  "1w": { type: "week", span: 1 },
  "1M": { type: "month", span: 1 },
};
const LIMIT = 500;
const POLL_MS = 15_000;

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

/** Casas decimais do preço: mais casas para preços pequenos (ex.: pares em BTC). */
function precisionFor(price: number): number {
  if (!(price > 0)) return 2;
  return Math.min(10, Math.max(2, Math.ceil(-Math.log10(price)) + 4));
}

async function loadCandles(symbol: string, interval: ChartInterval, end: number | null): Promise<KLineData[]> {
  const q = new URLSearchParams({ symbol, interval, limit: String(LIMIT) });
  if (end !== null) q.set("end", String(end));
  const res = await fetch(`/api/candles?${q}`);
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Preços indisponíveis");
  return (await res.json()) as KLineData[];
}

export type PaneHandle = {
  /** Começa a desenhar uma ferramenta (nome do KLineCharts). */
  draw: (tool: string) => void;
  setMagnet: (on: boolean) => void;
  setHidden: (what: "drawings" | "indicators", hidden: boolean) => void;
  clearDrawings: () => void;
};

/** Um gráfico (uma divisão): velas da Binance, indicadores e desenhos do estado salvo. */
export function ChartPane({
  pane,
  active,
  onActivate,
  onOverlays,
  onError,
  handleRef,
}: {
  pane: PaneState;
  active: boolean;
  onActivate: () => void;
  onOverlays: (overlays: OverlayState[]) => void;
  onError: (message: string | null) => void;
  handleRef: (h: PaneHandle | null) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<Chart | null>(null);
  const magnet = useRef<OverlayMode>("normal");
  const cb = useRef({ onOverlays, onError });
  useEffect(() => {
    cb.current = { onOverlays, onError };
  });

  // Cria o gráfico uma vez.
  useEffect(() => {
    registerChartExtensions();
    const node = el.current;
    if (!node) return;
    const c = init(node, { locale: "en-US", styles: STYLES, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    chart.current = c;
    const ro = new ResizeObserver(() => c?.resize());
    ro.observe(node);
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
    const list: OverlayState[] = c.getOverlays().map((o) => {
      const item: OverlayState = {
        name: o.name,
        points: o.points
          .filter((p) => typeof p.timestamp === "number" && typeof p.value === "number")
          .map((p) => ({ timestamp: p.timestamp as number, value: p.value as number })),
      };
      if (typeof o.extendData === "string") item.text = o.extendData;
      return item;
    });
    cb.current.onOverlays(list);
  };
  const overlayEvents = { onDrawEnd: emitOverlays, onPressedMoveEnd: emitOverlays, onRemoved: emitOverlays };

  // Ações da barra lateral.
  useEffect(() => {
    handleRef({
      draw: (tool) => {
        const c = chart.current;
        if (!c) return;
        let text: string | undefined;
        if (tool === "simpleAnnotation" || tool === "simpleTag") {
          text = (window.prompt("Texto:") ?? "").slice(0, 200).trim();
          if (!text) return;
        }
        c.createOverlay({ name: tool, mode: magnet.current, extendData: text, ...overlayEvents });
      },
      setMagnet: (on) => {
        magnet.current = on ? "weak_magnet" : "normal";
        chart.current?.overrideOverlay({ mode: magnet.current });
      },
      setHidden: (what, hidden) => {
        const c = chart.current;
        if (!c) return;
        if (what === "drawings") c.overrideOverlay({ visible: !hidden });
        else for (const i of c.getIndicators()) c.overrideIndicator({ id: i.id, name: i.name, visible: !hidden });
      },
      clearDrawings: () => {
        chart.current?.removeOverlay();
        emitOverlays();
      },
    });
    return () => handleRef(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Par e tempo: carrega as velas (e mais ao rolar para trás) e atualiza a última a cada 15 s.
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    let poll: ReturnType<typeof setInterval> | undefined;
    const quote = splitSymbol(pane.symbol)?.quote;
    c.setSymbol({ ticker: pane.symbol, pricePrecision: quote === "USDT" ? 2 : 8, volumePrecision: 2 });
    c.setPeriod(PERIOD[pane.interval]);
    c.setDataLoader({
      getBars: async ({ type, timestamp, callback }) => {
        try {
          if (type === "backward") return callback([], false);
          const end = type === "forward" && timestamp ? timestamp - 1 : null;
          const data = await loadCandles(pane.symbol, pane.interval, end);
          if (type === "init" && data.length) {
            const precision = precisionFor(data[data.length - 1].close);
            if (precision !== (quote === "USDT" ? 2 : 8)) c.setSymbol({ ticker: pane.symbol, pricePrecision: precision, volumePrecision: 2 });
          }
          cb.current.onError(null);
          callback(data, { forward: data.length === LIMIT, backward: false });
        } catch (e) {
          cb.current.onError(e instanceof Error ? e.message : "Preços indisponíveis");
          callback([], false);
        }
      },
      subscribeBar: ({ callback }) => {
        clearInterval(poll);
        poll = setInterval(async () => {
          try {
            const res = await fetch(`/api/candles?${new URLSearchParams({ symbol: pane.symbol, interval: pane.interval, limit: "2" })}`);
            if (!res.ok) return;
            const data = (await res.json()) as KLineData[];
            const last = data[data.length - 1];
            if (last) callback(last);
          } catch {}
        }, POLL_MS);
      },
      unsubscribeBar: () => clearInterval(poll),
    });
    return () => clearInterval(poll);
  }, [pane.symbol, pane.interval]);

  // Tipo de gráfico e escala.
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
    c.overrideYAxis({ paneId: "candle_pane", name: pane.scale });
  }, [pane.chartType, pane.scale]);

  // Indicadores: recria quando a lista muda.
  const indicatorKey = JSON.stringify(pane.indicators);
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    c.removeIndicator();
    for (const ind of pane.indicators) {
      c.createIndicator({ name: ind.name, calcParams: ind.params, ...(ind.pane === "main" ? { paneId: "candle_pane" } : {}) }, ind.pane === "main");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicatorKey]);

  // Desenhos salvos: aplica ao abrir (depois as mudanças vêm do próprio gráfico).
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    c.removeOverlay();
    for (const o of pane.overlays) {
      c.createOverlay({ name: o.name, points: o.points, extendData: o.text, ...overlayEvents });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      onPointerDown={onActivate}
      className={`relative h-full min-h-0 w-full rounded-lg border ${active ? "border-[#8b7cf6]" : "border-border"}`}
      data-testid="chart-pane"
    >
      <div ref={el} className="absolute inset-0" />
    </div>
  );
}
