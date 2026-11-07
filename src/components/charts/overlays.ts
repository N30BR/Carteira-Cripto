"use client";

// Eixo logarítmico próprio e ferramentas de desenho próprias (registrados uma vez por página).
// As regras (níveis do Fibonacci, faixa em log) ficam em lib/charts e são testadas sem navegador.
import { registerOverlay, registerYAxis, type KLineData, type OverlayFigure } from "klinecharts";
import { DEFAULT_FIB_LEVELS, fibPrice, findBarIndex } from "@/lib/charts/drawing";
import { anchoredVwap, volumeProfile, volumeProfileBand } from "@/lib/charts/indicators";
import { fromLog, logRange, logTickValues, toLog, type AxisRange } from "@/lib/charts/log-axis";
import { ELLIOTT_LABELS, type ExtendName, type FibLevel, type LabelPosition } from "@/lib/charts/workspace";

/** Cores padrão das ondas de Elliott (como a referência): alta verde, baixa vermelha. */
export const ELLIOTT_UP = "#22c55e";
export const ELLIOTT_DOWN = "#ef4444";
import { PROFILE_BUY, PROFILE_SELL, withAlpha } from "./profile";

const ACCENT = "#8b7cf6";
export const LOG_AXIS = "log10";

/** Dados extras de um desenho (o texto das anotações continua sendo uma string). */
export type OverlayExtra = {
  extend?: ExtendName;
  levels?: FibLevel[];
  rows?: number;
  valueArea?: number;
  /** Perfil de volume: compras/vendas. Ondas de Elliott: segmentos de alta/baixa. */
  buyColor?: string;
  sellColor?: string;
  /** Ondas de Elliott: rótulos (tamanho, mostrar, textos próprios, posição) e marcadores dos pontos. */
  labelSize?: number;
  showLabels?: boolean;
  showPoints?: boolean;
  labels?: string[];
  labelPosition?: LabelPosition;
  /** Perfil de volume (faixa fixa): deslocamento da exibição, em velas (não muda a faixa analisada). */
  shift?: number;
  /** Perfil de volume por faixa de preço: janela de tempo do cálculo (ms), guardada na inserção. */
  windowFrom?: number;
  windowTo?: number;
};
const extra = (v: unknown): OverlayExtra => (typeof v === "object" && v !== null ? (v as OverlayExtra) : {});

const fmt = (v: number) => {
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : Math.min(10, Math.ceil(-Math.log10(abs || 1)) + 4);
  return v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits });
};

type AxisSelf = { _range: AxisRange; _autoCalcTickFlag: boolean };

/**
 * Fim de um raio que sai de `p` na direção (dx, dy): longe o bastante para passar de qualquer borda da área
 * (o canvas corta o que sobra), inclusive com a origem fora da tela.
 */
export function rayEnd(p: { x: number; y: number }, dx: number, dy: number, b: { width: number; height: number }): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  if (!len) return p;
  const reach = (Math.abs(p.x) + Math.abs(p.y) + b.width + b.height) * 2;
  return { x: p.x + (dx / len) * reach, y: p.y + (dy / len) * reach };
}

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
        // O rótulo (nível e preço) também é clicável: seleciona e arrasta o Fibonacci inteiro, como as linhas.
        figures.push({
          type: "text",
          attrs: { x: x1 - 4, y, text: `${l.value} (${fmt(price)})`, align: "right", baseline: "middle" },
          styles: { color: l.color, backgroundColor: "transparent", size: 11, paddingTop: 3, paddingBottom: 3, paddingLeft: 2, paddingRight: 2 },
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

  // ---------- Raio horizontal: 1 clique, sempre para a direita, na altura do preço clicado ----------
  // (A versão da biblioteca pedia um 2º clique só para escolher o lado.) Desenhos antigos com 2 pontos
  // continuam válidos: só o 1º ponto conta.
  registerOverlay({
    name: "horizontalRayLine",
    totalStep: 2,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding }) => {
      const a = coordinates[0];
      if (!a) return [];
      return [{ type: "line", attrs: { coordinates: [a, { x: Math.max(bounding.width, a.x), y: a.y }] } }];
    },
    // Arrastar o ponto ou o raio mantém tudo na mesma altura (os pontos extras de desenhos antigos acompanham).
    performEventPressedMove: ({ points, performPoint }) => {
      for (const p of points) p.value = performPoint.value;
    },
  });

  // ---------- Raios paralelos: 1º clique = origem do 1º raio, 2º = direção, 3º = distância do 2º raio ----------
  // Diferente do canal paralelo (dois segmentos entre os cliques, com preenchimento) e das linhas paralelas
  // (infinitas nos dois sentidos): aqui os dois raios partem das origens e seguem num só sentido até a borda.
  registerOverlay({
    name: "parallelRays",
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      const ray = (p: { x: number; y: number }) => [p, rayEnd(p, b.x - a.x, b.y - a.y, bounding)];
      if (coordinates.length < 3) return [{ type: "line", attrs: { coordinates: ray(a) } }];
      const c = coordinates[2];
      // Mesma inclinação; o 2º raio passa pelo 3º clique (deslocado na vertical, como o canal paralelo).
      const slope = a.x === b.x ? 0 : (b.y - a.y) / (b.x - a.x);
      const dy = c.y - (a.y + slope * (c.x - a.x));
      const a2 = { x: a.x, y: a.y + dy };
      return [
        { type: "line", attrs: { coordinates: ray(a) } },
        { type: "line", attrs: { coordinates: ray(a2) } },
      ];
    },
  });

  // ---------- Ondas de Elliott: origem + um clique por onda; segmentos ligados e rótulos automáticos ----------
  // Verde quando o segmento sobe, vermelho quando desce (é a direção, não uma validação da contagem).
  for (const [name, labels] of Object.entries(ELLIOTT_LABELS)) {
    registerOverlay({
      name,
      totalStep: labels.length + 2,
      needDefaultPointFigure: true,
      needDefaultXAxisFigure: true,
      needDefaultYAxisFigure: true,
      createPointFigures: ({ coordinates, overlay }) => {
        if (coordinates.length < 2) return [];
        const ex = extra(overlay.extendData);
        const up = ex.buyColor ?? ELLIOTT_UP;
        const down = ex.sellColor ?? ELLIOTT_DOWN;
        const figures: OverlayFigure[] = [];
        // Espessura escolhida pela pessoa; sem escolha, 2 px (como a referência).
        const lineSize = (overlay.styles?.line as { size?: number } | undefined)?.size ?? 2;
        for (let i = 1; i < coordinates.length; i++) {
          const a = coordinates[i - 1];
          const b = coordinates[i];
          figures.push({ type: "line", attrs: { coordinates: [a, b] }, styles: { color: b.y <= a.y ? up : down, size: lineSize } });
        }
        // Triângulo completo: linhas auxiliares (roxas, tracejadas) por A–C–E e B–D.
        if (name === "elliottTriangle" && coordinates.length === 6) {
          const [, A, B, , D, E] = coordinates;
          const aux = { style: "dashed" as const, dashedValue: [4, 4], color: "#a78bfa", size: 1 };
          figures.push({ type: "line", attrs: { coordinates: [A, E] }, styles: aux, ignoreEvent: true });
          figures.push({ type: "line", attrs: { coordinates: [B, D] }, styles: aux, ignoreEvent: true });
        }
        const size = ex.labelSize ?? 13;
        const custom = ex.labels ?? [];
        for (let i = 1; i < coordinates.length; i++) {
          const p = coordinates[i];
          const prev = coordinates[i - 1];
          const next = coordinates[i + 1];
          // Topo (acima dos vizinhos) → rótulo em cima; fundo → embaixo; a pessoa pode fixar a posição.
          const peak = p.y <= prev.y && (!next || p.y <= next.y) ? true : p.y >= prev.y && (!next || p.y >= next.y) ? false : p.y < prev.y;
          const above = ex.labelPosition === "above" ? true : ex.labelPosition === "below" ? false : peak;
          if (ex.showPoints !== false) {
            figures.push({ type: "circle", attrs: { x: p.x, y: p.y, r: 4 }, styles: { style: "stroke_fill", color: "#0a0a0b", borderColor: "#ffffff", borderSize: 1.5 }, ignoreEvent: true });
          }
          if (ex.showLabels !== false) {
            figures.push({
              type: "text",
              attrs: { x: p.x, y: above ? p.y - 8 : p.y + 8, text: custom[i - 1] || labels[i - 1], align: "center", baseline: above ? "bottom" : "top" },
              styles: { color: "#ffffff", backgroundColor: "transparent", size, weight: "bold", paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0 },
              ignoreEvent: true,
            });
          }
        }
        return figures;
      },
    });
  }

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
    createPointFigures: ({ chart, coordinates, overlay, xAxis, yAxis, bounding }) => {
      if (coordinates.length < 2 || !yAxis) return [];
      const [p1, p2] = overlay.points;
      const data: KLineData[] = chart.getDataList();
      if (!data.length || typeof p1?.timestamp !== "number" || typeof p2?.timestamp !== "number") return [];
      const ts = data.map((d) => d.timestamp);
      const ex = extra(overlay.extendData);
      const rows = ex.rows ?? 24;
      const bars = data.map((d) => ({ ...d, volume: d.volume ?? 0 })) as never;
      // Modo faixa de preço (desenho novo): os dois pontos delimitam só os PREÇOS (o arraste horizontal não
      // conta); o tempo é a janela guardada na inserção (velas visíveis naquele momento).
      // Desenhos antigos (sem janela): o intervalo de tempo entre os dois pontos, como antes.
      const band = typeof ex.windowFrom === "number" && typeof ex.windowTo === "number" && typeof p1.value === "number" && typeof p2.value === "number";
      const i1 = findBarIndex(ts, band ? ex.windowFrom! : Math.min(p1.timestamp, p2.timestamp));
      const i2 = findBarIndex(ts, band ? ex.windowTo! : Math.max(p1.timestamp, p2.timestamp));
      // As velas trazem o volume comprador agressor (buyVolume) da Binance: segue junto.
      const vp = band
        ? volumeProfileBand(bars, i1, i2, p1.value as number, p2.value as number, rows, (ex.valueArea ?? 70) / 100)
        : volumeProfile(bars, i1, i2, rows, (ex.valueArea ?? 70) / 100);
      if (!vp.bins.length) return [];
      const color = (overlay.styles?.line as { color?: string } | undefined)?.color ?? ACCENT;
      const buyColor = ex.buyColor ?? PROFILE_BUY;
      const sellColor = ex.sellColor ?? PROFILE_SELL;
      const x1 = Math.min(coordinates[0].x, coordinates[1].x);
      const x2 = Math.max(coordinates[0].x, coordinates[1].x);
      // Faixa de preço: largura própria (o arraste pode ter sido só vertical), com a âncora no ponto mais à direita.
      const span = band ? Math.max(60, x2 - x1, bounding.width * 0.18) : Math.max(20, x2 - x1);
      // Posição de exibição separada da faixa analisada: o histograma pode ser arrastado na horizontal
      // (deslocamento em velas, ex.shift); os pontos e o cálculo continuam na faixa escolhida.
      const dx = (ex.shift ?? 0) * chart.getBarSpace().bar;
      // Faixa de preço: o histograma termina no ponto mais à direita; tempo: começa no 1º ponto (como antes).
      const vx1 = (band ? x2 - span : x1) + dx;
      // Como na referência (DGT): âncora no fim da faixa, barras crescendo para a esquerda (compras junto
      // à âncora, vendas em seguida) e o perfil de sentimento (compras − vendas) logo à direita.
      const anchor = vx1 + span;
      const width = span * 0.7;
      const sentiment = Math.max(12, span * 0.12);
      const max = Math.max(...vp.bins.map((b) => b.volume)) || 1;
      const maxDelta = Math.max(...vp.bins.map((b) => Math.abs(b.buy - b.sell))) || 1;
      const figures: OverlayFigure[] = [];
      if (band && xAxis) {
        // Faixa analisada: os preços entre os pontos, durante a janela de tempo usada no cálculo (fundo discreto).
        const wx1 = xAxis.convertToPixel(i1);
        const wx2 = xAxis.convertToPixel(i2);
        const ya = yAxis.convertToPixel(p1.value as number);
        const yb = yAxis.convertToPixel(p2.value as number);
        figures.push({ type: "rect", attrs: { x: wx1, y: Math.min(ya, yb), width: Math.max(1, wx2 - wx1), height: Math.abs(yb - ya) }, styles: { style: "fill", color: `${color.slice(0, 7)}10` }, ignoreEvent: true });
      } else {
        // Faixa analisada (fundo discreto); não se arrasta por aqui.
        figures.push({ type: "rect", attrs: { x: x1, y: 0, width: span, height: bounding.height }, styles: { style: "fill", color: `${color.slice(0, 7)}0d` }, ignoreEvent: true });
      }
      const rect = (x: number, y: number, w: number, h: number, c: string) =>
        figures.push({ type: "rect", attrs: { x, y, width: w, height: h }, styles: { style: "fill", color: c }, ignoreEvent: true });
      vp.bins.forEach((b, i) => {
        const yTop = yAxis.convertToPixel(b.to);
        const yBottom = yAxis.convertToPixel(b.from);
        const top = Math.min(yTop, yBottom);
        const h = Math.max(1, Math.abs(yBottom - yTop) - 1);
        const inValue = b.from >= vp.valueArea.low - 1e-12 && b.to <= vp.valueArea.high + 1e-12;
        const a = i === vp.pocIndex ? 1 : inValue ? 0.8 : 0.35;
        const wBuy = (b.buy / max) * width;
        const wSell = (b.sell / max) * width;
        rect(anchor - wBuy, top, wBuy, h, withAlpha(buyColor, a));
        rect(anchor - wBuy - wSell, top, wSell, h, withAlpha(sellColor, a));
        const d = b.buy - b.sell;
        rect(anchor + 2, top, (Math.abs(d) / maxDelta) * sentiment, h, withAlpha(d >= 0 ? buyColor : sellColor, 0.85));
      });
      const yHi = yAxis.convertToPixel(vp.bins[vp.bins.length - 1].to);
      const yLo = yAxis.convertToPixel(vp.bins[0].from);
      rect(anchor, Math.min(yHi, yLo), 1, Math.abs(yLo - yHi), "#a1a1aa66");
      // Área do histograma: clicar seleciona; arrastar desloca só na horizontal (ver onPressedMoving no gráfico).
      figures.push({
        key: "vp_body",
        type: "rect",
        attrs: { x: anchor - width, y: Math.min(yHi, yLo), width: width + sentiment + 2, height: Math.abs(yLo - yHi) },
        styles: { style: "fill", color: "#00000001" },
      });
      const poc = vp.bins[vp.pocIndex];
      const line = (price: number, label: string, c: string) => {
        const y = yAxis.convertToPixel(price);
        figures.push({ type: "line", attrs: { coordinates: [{ x: Math.min(x1, vx1), y }, { x: anchor + sentiment + 2, y }] }, styles: { color: c, style: "dashed", dashedValue: [4, 3] }, ignoreEvent: true });
        figures.push({ type: "text", attrs: { x: anchor + sentiment + 6, y, text: `${label} ${fmt(price)}`, baseline: "middle" }, styles: { color: c, backgroundColor: "transparent", size: 11 }, ignoreEvent: true });
      };
      line((poc.from + poc.to) / 2, "POC", "#facc15");
      line(vp.valueArea.high, "VAH", "#60a5fa");
      line(vp.valueArea.low, "VAL", "#60a5fa");
      figures.push({
        type: "text",
        attrs: {
          x: vx1 + 2,
          y: bounding.height - 6,
          text: vp.sideEstimated ? "Perfil estimado (OHLCV): compra/venda estimada" : "Perfil estimado por preço (OHLCV) · compra/venda real por vela (Binance)",
          baseline: "bottom",
        },
        styles: { color: "#a1a1aa", backgroundColor: "transparent", size: 10 },
        ignoreEvent: true,
      });
      return figures;
    },
  });
}
