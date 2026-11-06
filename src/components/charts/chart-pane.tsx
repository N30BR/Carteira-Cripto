"use client";

import { useEffect, useRef } from "react";
import { dispose, init, type Chart, type KLineData, type OverlayMode, type Period } from "klinecharts";
import type { ChartInterval } from "@/lib/charts/params";
import { splitSymbol } from "@/lib/charts/params";
import type { OverlayState, PaneState } from "@/lib/charts/workspace";
import { MACRO_SERIES } from "@/lib/charts/macro-ids";
import type { Point } from "@/lib/charts/macro-math";
import { COMPARE_COLORS, registerChartExtensions } from "./register";

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
    const ro = new ResizeObserver(() => {
      if (!c) return;
      fitPanes(c, node.clientHeight);
      c.resize();
    });
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
  // onRemoved chega antes de a biblioteca tirar o desenho da lista: espera ela terminar.
  const overlayEvents = { onDrawEnd: emitOverlays, onPressedMoveEnd: emitOverlays, onRemoved: () => void setTimeout(emitOverlays, 0) };

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

  // Indicadores: recria quando a lista muda (sem mexer nas comparações).
  const indicatorIds = useRef<string[]>([]);
  const indicatorKey = JSON.stringify(pane.indicators);
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    for (const id of indicatorIds.current) c.removeIndicator({ id });
    indicatorIds.current = [];
    for (const ind of pane.indicators) {
      const id = c.createIndicator({ name: ind.name, calcParams: ind.params, ...(ind.pane === "main" ? { paneId: "candle_pane" } : {}) }, ind.pane === "main");
      if (id) indicatorIds.current.push(id);
      // Heatmap de liquidações: busca o open interest do perpétuo e entrega ao indicador.
      if (id && ind.name === "LIQ_HEATMAP") {
        fetch(`/api/open-interest?${new URLSearchParams({ symbol: pane.symbol, interval: pane.interval })}`)
          .then(async (res) => {
            if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "indisponível");
            const oi = (await res.json()) as [number, number][];
            chart.current?.overrideIndicator({ id, name: "LIQ_HEATMAP", extendData: { oi } });
          })
          .catch((e) => cb.current.onError(`Liquidações: ${e instanceof Error ? e.message : "indisponível"}`));
      }
    }
    fitPanes(c, el.current?.clientHeight ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicatorKey, pane.symbol, pane.interval]);

  // Comparações: busca os dados (par da Binance no mesmo tempo, ou série do FRED) e desenha as linhas.
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
        let sub = false;
        if (cmp.kind === "pair") {
          const data = await loadCandles(cmp.id, pane.interval, null, 1000);
          points = data.map((k) => [k.timestamp, k.close]);
          label = cmp.id === "PAXGUSDT" ? "Ouro (PAXG)" : cmp.id;
        } else {
          const res = await fetch(`/api/macro?${new URLSearchParams({ id: cmp.id })}`);
          if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Dados indisponíveis");
          points = (await res.json()) as Point[];
          const meta = MACRO_SERIES.find((m) => m.id === cmp.id);
          label = meta?.label ?? cmp.id;
          sub = meta?.pane === "sub";
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
