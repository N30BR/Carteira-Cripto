// Camadas de volume e fluxo ligadas por botões próprios (fora da lista de indicadores e das legendas):
// - SIDE_INT: o perfil lateral INTEGRADO ao gráfico, desenhado ATRÁS das velas (o painel isolado continua na tela própria).
// - MARKS: linhas POC, VAH e VAL do perfil lateral (mesmo cálculo: sideProfileFor), por cima das velas, de ponta a ponta.
// - DELTA_PROF: Delta Horizontal — delta por faixa de preço no trecho visível, atrás das velas.
// - FOOTPRINT: compras e vendas agressoras por preço dentro de cada vela, por cima das velas.
// Fluxo por preço = velas menores REAIS da Binance (ver src/lib/charts/flow.ts); sem elas, nada é inventado.
import { registerIndicator, type KLineData } from "klinecharts";
import { deltaProfile, footprintCandle, footprintStep, groupSub, hasFlow, type FlowBar, type FootprintCandle } from "@/lib/charts/flow";
import { sideProfileFor } from "@/lib/charts/side-profile";
import { DELTA_DEFAULTS, FOOTPRINT_DEFAULTS, MARK_DEFAULTS, type FootprintStyle, type MarkStyle } from "@/lib/charts/workspace";
import { drawSideProfile } from "./liq-layers";
import { withAlpha } from "./profile";

export const SIDE_INT = "BH_SIDE_INT";
export const MARKS = "BH_MARKS";
export const DELTA_PROF = "BH_DELTA_PROF";
export const FOOTPRINT = "BH_FOOTPRINT";

type Axis = { convertToPixel: (v: number) => number; convertFromPixel: (p: number) => number };
type Ctx = { chart: { getDataList: () => KLineData[]; getVisibleRange: () => { from: number; to: number }; getBarSpace: () => { bar: number } }; bounding: { width: number; height: number }; yAxis: unknown };

/** Velas e faixa de preço visíveis (o mesmo critério do perfil lateral). */
function view({ chart, bounding, yAxis }: Ctx) {
  const Y = yAxis as Axis;
  const data = chart.getDataList();
  const r = chart.getVisibleRange();
  const from = Math.max(0, r.from);
  const to = Math.min(data.length - 1, r.to - 1);
  const hi = Y.convertFromPixel(0);
  const lo = Y.convertFromPixel(bounding.height);
  return { data, from, to, lo, hi, Y };
}

const compact = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  if (a >= 10) return v.toFixed(0);
  return v.toFixed(a >= 1 ? 1 : 2);
};
const fmtPrice = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: v >= 100 ? 2 : v >= 1 ? 4 : 8 });
const dash = (style: string | undefined, size: number) => (style === "dashed" ? [6, 4] : style === "dotted" ? [Math.max(1, size), 3] : []);

// ---------- perfil lateral integrado (atrás das velas) ----------

type SideIntData = { width: number; buy?: string; sell?: string };

// ---------- marcações ----------

type MarksData = { poc?: MarkStyle; vah?: MarkStyle; val?: MarkStyle; reserve?: number };

// ---------- Delta Horizontal ----------

type DeltaData = { sub?: FlowBar[]; subId?: string; width?: number; pos?: string; neg?: string; reserve?: number };
let deltaState: { levels: ReturnType<typeof deltaProfile>["levels"]; zeroX: number; half: number; max: number; Y: Axis; res: string } | null = null;

/** Faixa do Delta Horizontal sob o cursor (coordenadas da área do gráfico). */
export function deltaHit(x: number, y: number): { from: number; to: number; buy: number; sell: number; res: string } | null {
  const s = deltaState;
  if (!s || x < s.zeroX - s.half - 4 || x > s.zeroX + s.half + 4) return null;
  for (const L of s.levels) {
    const y1 = s.Y.convertToPixel(L.to);
    const y2 = s.Y.convertToPixel(L.from);
    if (y >= Math.min(y1, y2) && y <= Math.max(y1, y2)) {
      const d = L.buy - L.sell;
      const len = (Math.abs(d) / s.max) * s.half;
      const inBar = d >= 0 ? x >= s.zeroX - 4 && x <= s.zeroX + len + 4 : x <= s.zeroX + 4 && x >= s.zeroX - len - 4;
      return inBar && L.buy + L.sell > 0 ? { from: L.from, to: L.to, buy: L.buy, sell: L.sell, res: s.res } : null;
    }
  }
  return null;
}

// ---------- Footprint ----------

type FootData = { sub?: FlowBar[]; subId?: string; barMs?: number; style?: FootprintStyle };
let footMemo: { key: string; candles: Map<number, FootprintCandle> } | null = null;
type FootCell = { x1: number; x2: number; y1: number; y2: number; c: FootprintCandle; k: number };
let footState: { cells: FootCell[] } | null = null;

/** Nível do Footprint sob o cursor. */
export function footHit(x: number, y: number): { time: number; from: number; to: number; buy: number; sell: number; candle: FootprintCandle } | null {
  for (const cell of footState?.cells ?? []) {
    if (x >= cell.x1 && x <= cell.x2 && y >= cell.y1 && y <= cell.y2) {
      const L = cell.c.levels[cell.k];
      return { time: cell.c.timestamp, from: L.from, to: L.to, buy: L.buy, sell: L.sell, candle: cell.c };
    }
  }
  return null;
}

export const fmtFlow = compact;

let done = false;
export function registerFlowLayers(): void {
  if (done) return;
  done = true;

  registerIndicator<Record<string, never>, number, SideIntData>({
    name: SIDE_INT,
    shortName: "",
    series: "price",
    figures: [],
    calc: (data) => data.map(() => ({})),
    draw: (p) => {
      const { ctx, indicator, bounding } = p;
      const e = indicator.extendData;
      if (!indicator.visible || !e) return true;
      const { data, from, to, lo, hi, Y } = view(p as unknown as Ctx);
      const W = Math.min(e.width, bounding.width * 0.6);
      ctx.save();
      ctx.translate(bounding.width - W, 0);
      drawSideProfile(ctx, { key: "bh_side", width: W, height: bounding.height, lo, hi, from, to, data, yOf: (v) => Y.convertToPixel(v), buyColor: e.buy, sellColor: e.sell, integrated: true, noClear: true });
      ctx.restore();
      return true;
    },
  });

  registerIndicator<Record<string, never>, number, MarksData>({
    name: MARKS,
    shortName: "",
    series: "price",
    figures: [],
    calc: (data) => data.map(() => ({})),
    draw: (p) => {
      const { ctx, indicator, bounding } = p;
      if (!indicator.visible) return true;
      const { data, from, to, lo, hi, Y } = view(p as unknown as Ctx);
      if (!data.length || !(hi > lo) || to < from) return true;
      const vp = sideProfileFor(data, from, to, lo, hi);
      if (vp.pocIndex < 0 || !vp.bins.some((b) => b.volume > 0)) return true;
      const e = indicator.extendData ?? {};
      const poc = vp.bins[vp.pocIndex];
      const right = bounding.width - (e.reserve ?? 0);
      ctx.save();
      for (const [key, label, price] of [
        ["vah", "VAH", vp.valueArea.high],
        ["poc", "POC", (poc.from + poc.to) / 2],
        ["val", "VAL", vp.valueArea.low],
      ] as const) {
        const st = { ...MARK_DEFAULTS[key], ...e[key] };
        const y = Math.round(Y.convertToPixel(price)) + 0.5;
        if (y < 0 || y > bounding.height) continue;
        ctx.strokeStyle = st.color;
        ctx.lineWidth = st.size;
        ctx.setLineDash(dash(st.style, st.size));
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(right, y);
        ctx.stroke();
        if (st.label) {
          ctx.setLineDash([]);
          ctx.font = "600 10px Geist, sans-serif";
          const text = `${label} ${fmtPrice(price)}`;
          const w = ctx.measureText(text).width + 8;
          ctx.fillStyle = "rgba(9, 9, 11, 0.85)";
          ctx.fillRect(4, y - 8, w, 15);
          ctx.fillStyle = withAlpha(st.color, 1);
          ctx.fillText(text, 8, y + 3.5);
        }
      }
      ctx.restore();
      return true;
    },
  });

  registerIndicator<Record<string, never>, number, DeltaData>({
    name: DELTA_PROF,
    shortName: "",
    series: "price",
    figures: [],
    calc: (data) => data.map(() => ({})),
    draw: (p) => {
      const { ctx, indicator, bounding } = p;
      deltaState = null;
      if (!indicator.visible) return true;
      const { data, from, to, lo, hi, Y } = view(p as unknown as Ctx);
      if (!data.length || !(hi > lo) || to < from) return true;
      const e = indicator.extendData ?? {};
      const t0 = data[from].timestamp;
      const t1 = data[to].timestamp;
      // Velas menores do trecho visível; sem elas (ainda carregando ou fora do alcance), as próprias velas do gráfico.
      const sub = (e.sub ?? []).filter((b) => b.timestamp >= t0 && b.timestamp <= t1 + 1);
      const useSub = sub.length > 0;
      const base = useSub ? sub : (data.slice(from, to + 1) as FlowBar[]);
      const rows = Math.max(12, Math.min(80, Math.round(bounding.height / 10)));
      const { levels, used } = deltaProfile(base, lo, hi, rows);
      ctx.save();
      ctx.font = "10px Geist, sans-serif";
      const width = e.width ?? DELTA_DEFAULTS.width;
      const half = width / 2;
      const zeroX = bounding.width - (e.reserve ?? 0) - half - 10;
      if (!used) {
        ctx.fillStyle = "#71717a";
        ctx.fillText("Delta por preço: sem fluxo agressor neste instrumento", zeroX - half, 14);
        ctx.restore();
        return true;
      }
      const max = Math.max(...levels.map((L) => Math.abs(L.buy - L.sell))) || 1;
      const res = useSub ? `velas de ${e.subId}` : "velas do gráfico";
      deltaState = { levels, zeroX, half, max, Y, res };
      for (const L of levels) {
        const d = L.buy - L.sell;
        if (!d) continue;
        const yTop = Y.convertToPixel(L.to);
        const yBot = Y.convertToPixel(L.from);
        const h = Math.max(1, Math.abs(yBot - yTop) - 1);
        const len = (Math.abs(d) / max) * half;
        ctx.fillStyle = d >= 0 ? (e.pos ?? DELTA_DEFAULTS.pos) : (e.neg ?? DELTA_DEFAULTS.neg);
        ctx.fillRect(d >= 0 ? zeroX : zeroX - len, Math.min(yTop, yBot) + 0.5, len, h);
      }
      ctx.strokeStyle = "rgba(161, 161, 170, 0.55)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(zeroX + 0.5, 0);
      ctx.lineTo(zeroX + 0.5, bounding.height);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#a1a1aa";
      ctx.fillText(`Delta por preço · ${res}`, zeroX - half, 14);
      ctx.restore();
      return true;
    },
  });

  registerIndicator<Record<string, never>, number, FootData>({
    name: FOOTPRINT,
    shortName: "",
    series: "price",
    figures: [],
    calc: (data) => data.map(() => ({})),
    draw: (p) => {
      const { ctx, indicator, bounding, chart, xAxis } = p;
      footState = null;
      if (!indicator.visible) return true;
      const { data, from, to, Y } = view(p as unknown as Ctx);
      const e = indicator.extendData ?? {};
      const st = { ...FOOTPRINT_DEFAULTS, ...e.style };
      const X = xAxis as unknown as Axis;
      const space = chart.getBarSpace().bar;
      ctx.save();
      ctx.font = "10px Geist, sans-serif";
      const sub = e.sub ?? [];
      if (!data.length || to < from) return (ctx.restore(), true);
      if (!sub.length || !e.barMs) {
        ctx.fillStyle = "#71717a";
        ctx.fillText(e.subId === "none" ? "Footprint: sem velas menores para este tempo (use 5m ou maior)" : !data.some(hasFlow) ? "Footprint: sem fluxo agressor neste instrumento" : "Footprint: carregando velas menores...", 10, 14);
        ctx.restore();
        return true;
      }
      if (space < 8) {
        ctx.fillStyle = "#71717a";
        ctx.fillText("Footprint: aproxime o gráfico para ver o fluxo por preço", 10, 14);
        ctx.restore();
        return true;
      }
      const visible = data.slice(from, to + 1) as FlowBar[];
      const step = st.rowMode === "count" ? null : footprintStep(visible, st);
      const key = `${data.length}|${data[data.length - 1].timestamp}|${data[data.length - 1].close}|${from}|${to}|${sub.length}|${sub[sub.length - 1]?.timestamp}|${step}|${JSON.stringify(e.style ?? {})}`;
      if (!footMemo || footMemo.key !== key) {
        const groups = groupSub(visible, e.barMs, sub);
        const candles = new Map<number, FootprintCandle>();
        for (const c of visible) candles.set(c.timestamp, footprintCandle(c, groups.get(c.timestamp) ?? [], step, { ...st, imbalancePct: st.imbalancePct }));
        footMemo = { key, candles };
      }
      // Referência das cores: maior nível visível (volume ou |delta|), para o gradiente não saturar tudo.
      let maxVol = 0;
      let maxDelta = 0;
      for (const c of footMemo.candles.values())
        for (const L of c.levels) {
          maxVol = Math.max(maxVol, L.buy, L.sell, st.mode === "volume" ? L.buy + L.sell : 0);
          maxDelta = Math.max(maxDelta, Math.abs(L.delta));
        }
      const cells: FootCell[] = [];
      const slot = space * 0.92;
      const detail = space >= 34;
      for (let i = from; i <= to; i++) {
        const c = footMemo.candles.get(data[i].timestamp);
        if (!c || !c.used) continue;
        const cx = X.convertToPixel(i);
        const x1 = cx - slot / 2;
        const x2 = cx + slot / 2;
        const mid = cx;
        c.levels.forEach((L, k) => {
          const yTop = Y.convertToPixel(L.to);
          const yBot = Y.convertToPixel(L.from);
          const y1 = Math.min(yTop, yBot);
          const h = Math.max(1, Math.abs(yBot - yTop) - (detail ? 1 : 0));
          if (y1 > bounding.height || y1 + h < 0) return;
          const a = (v: number, ref: number) => (st.gradient ? 0.18 + 0.67 * Math.min(1, v / (ref || 1)) : 0.6);
          if (st.mode === "bidask") {
            ctx.fillStyle = withAlpha(st.sellColor, a(L.sell, maxVol));
            ctx.fillRect(x1, y1, mid - x1 - 0.5, h);
            ctx.fillStyle = withAlpha(st.buyColor, a(L.buy, maxVol));
            ctx.fillRect(mid + 0.5, y1, x2 - mid - 0.5, h);
          } else if (st.mode === "delta") {
            ctx.fillStyle = withAlpha(L.delta >= 0 ? st.buyColor : st.sellColor, a(Math.abs(L.delta), maxDelta));
            ctx.fillRect(x1, y1, x2 - x1, h);
          } else {
            ctx.fillStyle = withAlpha("#a1a1aa", a(L.buy + L.sell, maxVol) * 0.8);
            ctx.fillRect(x1, y1, x2 - x1, h);
          }
          if (st.showPoc && k === c.pocIndex) {
            ctx.strokeStyle = "#facc15";
            ctx.lineWidth = 1;
            ctx.strokeRect(x1 + 0.5, y1 + 0.5, x2 - x1 - 1, h - 1);
          }
          // Textos só com espaço (sem números ilegíveis em velas estreitas).
          if (detail && h >= 9) {
            ctx.font = `${Math.min(11, Math.max(8, h - 2))}px Geist, sans-serif`;
            ctx.textBaseline = "middle";
            const yc = y1 + h / 2;
            const put = (text: string, x: number, align: CanvasTextAlign, hot: boolean) => {
              ctx.textAlign = align;
              ctx.fillStyle = hot && st.showImbalance ? st.imbColor : st.textColor;
              ctx.fillText(text, x, yc);
            };
            const show = (v: number) => !(st.hideZeros && v === 0) && v >= st.minVolume;
            if (st.mode === "bidask") {
              if (show(L.sell)) put(compact(L.sell), mid - 3, "right", L.sellImb);
              if (show(L.buy)) put(compact(L.buy), mid + 3, "left", L.buyImb);
            } else if (st.mode === "delta") {
              if (show(Math.abs(L.delta))) put(compact(L.delta), mid, "center", L.buyImb || L.sellImb);
            } else if (show(L.buy + L.sell)) put(compact(L.buy + L.sell), mid, "center", false);
          }
          // Imbalances empilhados: marca na borda do lado (compras à direita, vendas à esquerda).
          if (st.showImbalance && (L.stackedBuy || L.stackedSell)) {
            ctx.fillStyle = st.imbColor;
            if (L.stackedBuy) ctx.fillRect(x2 - 2, y1, 2, h);
            if (L.stackedSell) ctx.fillRect(x1, y1, 2, h);
          }
          cells.push({ x1, x2, y1, y2: y1 + h, c, k });
        });
        // Área de valor da vela: traço fino à esquerda.
        if (st.showValueArea) {
          const ya = Y.convertToPixel(c.vaHigh);
          const yb = Y.convertToPixel(c.vaLow);
          ctx.fillStyle = "rgba(96, 165, 250, 0.8)";
          ctx.fillRect(x1 - 3, Math.min(ya, yb), 2, Math.abs(yb - ya));
        }
        // Resumo: delta e volume total da vela, embaixo dela.
        if (st.summary && space >= 40) {
          const yLow = Y.convertToPixel(Math.min(...c.levels.map((L) => L.from)));
          if (yLow + 26 < bounding.height) {
            ctx.font = "9px Geist, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = "rgba(9, 9, 11, 0.85)";
            ctx.fillRect(x1, yLow + 3, x2 - x1, 22);
            ctx.fillStyle = c.delta >= 0 ? st.buyColor.slice(0, 7) : st.sellColor.slice(0, 7);
            ctx.fillText(`Δ ${compact(c.delta)}`, cx, yLow + 5);
            ctx.fillStyle = "#a1a1aa";
            ctx.fillText(`V ${compact(c.volume)}`, cx, yLow + 15);
          }
        }
      }
      footState = { cells };
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.font = "10px Geist, sans-serif";
      ctx.fillStyle = "#71717a";
      ctx.fillText(`Footprint aproximado: compras/vendas agressoras reais de velas de ${e.subId} (Binance), repartidas pela faixa de cada uma`, 10, bounding.height - 58);
      ctx.restore();
      return true;
    },
  });
}
