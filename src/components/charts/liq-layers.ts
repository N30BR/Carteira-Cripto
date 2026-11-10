// Mapa de liquidações (heatmap histórico) e perfil de volume lateral — camadas do gráfico ligadas por botões próprios.
// São internas (não aparecem na lista de indicadores nem nas legendas) e não mexem no "Heatmap de liquidações" da lista,
// nos perfis de volume existentes nem na ferramenta Perfil de Volume (Faixa Fixa).
//
// - LIQ_MAP: atrás das velas (zLevel negativo). Campo tempo × preço de liquidez de liquidação ESTIMADA
//   (liquidationHeatField: open interest histórico da Bybit, desde 2020 — ou o da Binance Futures, ~30 dias, se a Bybit
//   faltar — + alavancagens típicas), desenhado como imagem: uma coluna por vela visível e uma linha a cada 2 px,
//   ampliada com suavização (faixas contínuas, sem milhares de retângulos). Só onde há dados: antes do 1º open
//   interest fica vazio e marcado; depois da última vela não há nada.
// - Perfil lateral (drawSideProfile): tela própria colada na lateral direita da área do gráfico, por cima de tudo, com
//   o MESMO cálculo da ferramenta Perfil de Volume (Faixa Fixa) — sideProfileFor → volumeProfileBand, 24 faixas, área de
//   valor 70% — sobre as velas visíveis e a faixa de preço visível. Só as barras de compra/venda (a parte esquerda do
//   histograma da ferramenta), ancoradas à direita. Sem "girar".
import { registerIndicator, type KLineData } from "klinecharts";
import { heatBucketOf, heatBucketRange, heatIntensity, heatReference, heatValue, liquidationHeatField, type LiqHeatField, type VolumeProfile } from "@/lib/charts/indicators";
import { softHeat } from "@/lib/charts/heat-soft";
import { sideProfileFor } from "@/lib/charts/side-profile";
import { PROFILE_BUY, PROFILE_SELL, withAlpha } from "./profile";

export const LIQ_MAP = "LIQ_MAP";
/** Largura da faixa lateral (px). */
export const SIDE_WIDTH = 124;

type LiqData = { oi: [number, number][]; status?: string; source?: string };
const bars = (d: KLineData[]) => d.map((b) => ({ ...b, volume: b.volume ?? 0 }));
const dataKey = (d: KLineData[]) => `${d.length}:${d[0]?.timestamp}:${d[d.length - 1]?.timestamp}:${d[d.length - 1]?.close}`;

/** Campo calculado uma vez por conjunto de velas + open interest. */
let fieldMemo: { key: string; oi: unknown; field: LiqHeatField } | null = null;
function fieldFor(data: KLineData[], oi: [number, number][]): LiqHeatField {
  const key = dataKey(data);
  if (!fieldMemo || fieldMemo.key !== key || fieldMemo.oi !== oi) fieldMemo = { key, oi, field: liquidationHeatField(bars(data), oi) };
  return fieldMemo.field;
}

const money = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}B`;
  if (a >= 1e6) return `$${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  if (a >= 1e3) return `$${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}K`;
  return `$${Math.round(v).toLocaleString("pt-BR")}`;
};
const fmtPrice = (v: number) => `$${v.toLocaleString("pt-BR", { maximumFractionDigits: v >= 100 ? 0 : v >= 1 ? 2 : 8 })}`;
const day = (t: number) => new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

// ---------- mapa ----------


type Axis = { convertToPixel: (v: number) => number; convertFromPixel: (p: number) => number };
/** Último desenho do mapa (para a dica do mouse). */
let mapState: { field: LiqHeatField; ref: number; data: KLineData[]; x: Axis; y: Axis; width: number; height: number } | null = null;
/** Imagem do mapa reaproveitada enquanto nada muda (o cursor redesenha o gráfico sem mudar o mapa). */
let image: { key: string; canvas: HTMLCanvasElement } | null = null;

export type MapHit = { time: number; from: number; to: number; value: number; long: number; short: number; intensity: number };

/** O que está sob o cursor no mapa (coordenadas da área do gráfico); null fora dos dados ou sem liquidez relevante. */
export function liqMapHit(x: number, y: number): MapHit | null {
  const s = mapState;
  if (!s || x < 0 || y < 0 || x > s.width || y > s.height) return null;
  const i = Math.round(s.x.convertFromPixel(x));
  const j = heatBucketOf(s.field, s.y.convertFromPixel(y));
  if (i < s.field.start || i >= s.data.length || j < 0) return null;
  const value = heatValue(s.field, i, j);
  const intensity = heatIntensity(value, s.ref);
  if (intensity < 0.05) return null;
  const o = (i - s.field.start) * s.field.buckets + j;
  return { time: s.data[i].timestamp, ...heatBucketRange(s.field, j), value, long: s.field.long[o], short: s.field.short[o], intensity };
}

/** Dica do mapa, já formatada. */
export function mapTipLines(h: MapHit): [string, string][] {
  return [
    ["Data", new Date(h.time).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })],
    ["Preço", `${fmtPrice(h.from)} – ${fmtPrice(h.to)}`],
    ["Intensidade", `${Math.round(h.intensity * 100)}% (relativa)`],
    ["Liquidez estimada", money(h.value)],
    ["Compradas · vendidas", `${money(h.long)} · ${money(h.short)}`],
  ];
}

let done = false;
export function registerLiqLayers(): void {
  if (done) return;
  done = true;

  registerIndicator<Record<string, never>, number, LiqData>({
    name: LIQ_MAP,
    shortName: "",
    series: "price",
    figures: [],
    calc: (data) => data.map(() => ({})),
    draw: ({ ctx, chart, indicator, bounding, xAxis, yAxis }) => {
      const data = chart.getDataList();
      const oi = indicator.extendData?.oi ?? [];
      mapState = null;
      if (!indicator.visible || !oi.length || data.length < 2) return true;
      const field = fieldFor(data, oi);
      if (field.start < 0) return true;
      const X = xAxis as unknown as Axis;
      const Y = yAxis as unknown as Axis;
      const range = chart.getVisibleRange();
      const from = Math.max(0, range.from);
      const to = Math.min(data.length - 1, range.to - 1);
      const top = Y.convertFromPixel(0);
      const bottom = Y.convertFromPixel(bounding.height);
      if (!(to >= from) || !Number.isFinite(top) || !Number.isFinite(bottom)) return true;
      const jTop = heatBucketOf(field, Math.max(top, bottom));
      const jHi = jTop < 0 ? field.buckets - 1 : jTop;
      const jLo = Math.max(0, heatBucketOf(field, Math.min(top, bottom)));
      const ref = heatReference(field, from, to, jLo, jHi);
      mapState = { field, ref, data, x: X, y: Y, width: bounding.width, height: bounding.height };
      const half = chart.getBarSpace().bar / 2;
      const first = Math.max(from, field.start);
      ctx.save();
      if (first <= to && ref > 0) {
        // Imagem: coluna por vela (de `first` a `to`), linha a cada 2 px; cada linha lê o preço daquela altura
        // (vale para escala normal e log) e interpola entre as faixas de preço vizinhas.
        const key = `${fieldMemo?.key}|${first}|${to}|${top}|${bottom}|${bounding.height}|${ref}`;
        if (!image || image.key !== key) {
          const w = to - first + 1;
          const h = Math.max(1, Math.ceil(bounding.height / 2));
          const canvas = image?.canvas ?? document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const g = canvas.getContext("2d");
          if (g) {
            const img = g.createImageData(w, h);
            // Posição (em faixas do campo) de uma altura da tela.
            const posAt = (y: number) => {
              const p = Y.convertFromPixel(Math.max(0, Math.min(bounding.height, y)));
              return p > 0 ? ((Math.log(p) - field.lnLo) / (field.lnHi - field.lnLo)) * field.buckets - 0.5 : NaN;
            };
            for (let r = 0; r < h; r++) {
              const pos = posAt((r + 0.5) * 2);
              if (!Number.isFinite(pos) || pos < -0.5 || pos > field.buckets - 0.5) continue;
              // Linha cobrindo várias faixas (gráfico afastado): média delas, sem pular nenhuma (evita listras falsas).
              // Linha menor que uma faixa (aproximado): interpolação entre as duas vizinhas.
              const pa = posAt(r * 2);
              const pb = posAt((r + 1) * 2);
              const ja = Math.max(0, Math.round(Math.min(pa, pb)));
              const jb = Math.min(field.buckets - 1, Math.round(Math.max(pa, pb)));
              const wide = Number.isFinite(pa) && Number.isFinite(pb) && jb > ja;
              const j0 = Math.max(0, Math.floor(pos));
              const j1 = Math.min(field.buckets - 1, j0 + 1);
              const f = Math.max(0, Math.min(1, pos - j0));
              for (let c = 0; c < w; c++) {
                let v = 0;
                if (wide) {
                  for (let j = ja; j <= jb; j++) v += heatValue(field, first + c, j);
                  v /= jb - ja + 1;
                } else v = heatValue(field, first + c, j0) * (1 - f) + heatValue(field, first + c, j1) * f;
                const t = heatIntensity(v, ref);
                if (t < 0.03) continue;
                const [R, G, B, A] = softHeat(t);
                const p = (r * w + c) * 4;
                img.data[p] = R;
                img.data[p + 1] = G;
                img.data[p + 2] = B;
                // Baixa intensidade mais transparente; alta mais presente, sem cobrir as velas.
                img.data[p + 3] = Math.round(255 * A);
              }
            }
            g.putImageData(img, 0, 0);
          }
          image = { key, canvas };
        }
        const x1 = X.convertToPixel(first) - half;
        const x2 = X.convertToPixel(to) + half;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(image.canvas, x1, 0, Math.max(1, x2 - x1), bounding.height);
      }
      // Por cima de tudo: onde os dados começam e a legenda.
      ctx.globalCompositeOperation = "source-over";
      ctx.font = "10px Geist, sans-serif";
      if (field.start > from && field.start <= to) {
        const sx = X.convertToPixel(field.start) - half;
        ctx.strokeStyle = "rgba(161, 161, 170, 0.5)";
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, bounding.height);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#a1a1aa";
        ctx.textAlign = "right";
        ctx.fillText(`Sem dados de open interest antes de ${day(data[field.start].timestamp)}`, sx - 6, 14);
        ctx.textAlign = "left";
      }
      const lx = 10;
      // Um pouco acima do rodapé (onde outros desenhos escrevem as notas deles).
      const ly = bounding.height - 44;
      ctx.fillStyle = "#d4d4d8";
      ctx.fillText("Intensidade relativa  Baixa", lx, ly);
      const gx = lx + ctx.measureText("Intensidade relativa  Baixa").width + 6;
      const grad = ctx.createLinearGradient(gx, 0, gx + 80, 0);
      // Legenda com as mesmas cores suavizadas do mapa (opacas, para ler bem).
      for (const p of [0, 0.2, 0.4, 0.6, 0.75, 0.88, 1]) {
        const [R, G, B] = softHeat(p);
        grad.addColorStop(p, `rgb(${R}, ${G}, ${B})`);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(gx, ly - 6, 80, 4);
      ctx.fillStyle = "#d4d4d8";
      ctx.fillText("Alta", gx + 86, ly);
      ctx.fillStyle = "#71717a";
      const source = indicator.extendData?.source === "bybit" ? "open interest histórico da Bybit (perpétuo USDT)" : "open interest Binance Futures (até 30 dias)";
      ctx.fillText(`Liquidações estimadas: ${source} + alavancagem típica`, lx, ly + 13);
      ctx.restore();
      return true;
    },
  });
}

// ---------- perfil lateral ----------

/** Geometria do perfil desenhado por último (para a dica ao passar o mouse). */
const sideAreas = new Map<string, { width: number; height: number; vp: VolumeProfile; yOf: (p: number) => number; max: number; anchor: number; inner: number; integrated: boolean }>();

/** O que está sob o cursor na faixa lateral (coordenadas da própria faixa); null fora das barras. */
export type SideHit = { from: number; to: number; volume: number; buy: number; sell: number; /** Trecho sob o cursor: compras (junto à borda direita) ou vendas (à esquerda delas). */ part: "buy" | "sell" };
export function sideHit(key: string, x: number, y: number): SideHit | null {
  const a = sideAreas.get(key);
  if (!a || x < 0 || x > a.width || y < 0 || y > a.height) return null;
  // A linha sob o cursor; sem ela, a mais próxima até 4 px (barras finas também respondem).
  let best: { b: (typeof a.vp.bins)[number]; d: number } | null = null;
  for (const b of a.vp.bins) {
    if (!(b.volume > 0)) continue;
    const y1 = Math.min(a.yOf(b.to), a.yOf(b.from));
    const y2 = Math.max(a.yOf(b.to), a.yOf(b.from));
    const d = y < y1 ? y1 - y : y > y2 ? y - y2 : 0;
    if (d <= 4 && (!best || d < best.d)) best = { b, d };
  }
  if (!best) return null;
  const b = best.b;
  const wBuy = (b.buy / a.max) * a.inner;
  // Integrado ao gráfico: só sobre a própria barra (o resto da borda é gráfico e continua dele).
  if (a.integrated && x < a.anchor - wBuy - (b.sell / a.max) * a.inner - 4) return null;
  // Compras ficam junto à borda direita; à esquerda delas (vendas e o espaço livre da linha), vendas.
  const part = x >= a.anchor - wBuy - 3 ? "buy" : "sell";
  return { from: b.from, to: b.to, volume: b.volume, buy: b.buy, sell: b.sell, part };
}

/** Dica do perfil, já formatada. */
export function sideTipLines(h: SideHit): [string, string][] {
  const n = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: v >= 100 ? 0 : 2 });
  return [
    ["Faixa de preço", `${fmtPrice(h.from)} – ${fmtPrice(h.to)}`],
    ["Volume", n(h.volume)],
    ["Compras · vendas", `${n(h.buy)} · ${n(h.sell)}`],
  ];
}

/**
 * Perfil de volume lateral numa tela própria sobre a lateral direita do gráfico. `from..to`: velas visíveis;
 * `lo..hi`: faixa de preço visível; `yOf` converte preço em pixel da área do gráfico.
 * Mesmo desenho das barras da Faixa Fixa: compras junto à âncora (direita), vendas em seguida; POC forte, área de
 * valor média, fora dela apagada.
 */
export function drawSideProfile(
  ctx: CanvasRenderingContext2D,
  o: { key: string; width: number; height: number; lo: number; hi: number; from: number; to: number; data: KLineData[]; yOf: (price: number) => number; buyColor?: string; sellColor?: string; integrated?: boolean; noClear?: boolean },
): void {
  const { width: W, height, yOf } = o;
  // Desenhando dentro do gráfico (integrado, atrás das velas): não apaga o que já está ali.
  if (!o.noClear) ctx.clearRect(0, 0, W, height);
  // Painel isolado: fundo e borda próprios. Integrado ao gráfico: sem fundo (as barras ficam sobre o gráfico).
  if (!o.integrated) {
    ctx.fillStyle = "rgba(9, 9, 11, 0.94)";
    ctx.fillRect(0, 0, W, height);
    ctx.fillStyle = "rgba(139, 124, 246, 0.35)";
    ctx.fillRect(0, 0, 1, height);
  }
  const vp = o.data.length && o.hi > o.lo && o.to >= o.from ? sideProfileFor(o.data, o.from, o.to, o.lo, o.hi) : null;
  const max = vp ? Math.max(0, ...vp.bins.map((b) => b.volume)) : 0;
  if (!vp || !max) {
    sideAreas.delete(o.key);
    if (o.integrated) return;
    ctx.fillStyle = "#71717a";
    ctx.font = "10px Geist, sans-serif";
    ctx.fillText("Sem volume neste trecho", 8, 18);
    return;
  }
  const anchor = W - 3;
  const inner = W - 12;
  sideAreas.set(o.key, { width: W, height, vp, yOf, max, anchor, inner, integrated: !!o.integrated });
  vp.bins.forEach((b, i) => {
    const yTop = yOf(b.to);
    const yBottom = yOf(b.from);
    const top = Math.min(yTop, yBottom);
    const h = Math.max(1, Math.abs(yBottom - yTop) - 1);
    const inValue = b.from >= vp.valueArea.low - 1e-12 && b.to <= vp.valueArea.high + 1e-12;
    // Integrado ao gráfico: mais transparente, para as velas por baixo continuarem legíveis.
    const a = (i === vp.pocIndex ? 1 : inValue ? 0.8 : 0.35) * (o.integrated ? 0.65 : 1);
    const wBuy = (b.buy / max) * inner;
    const wSell = (b.sell / max) * inner;
    ctx.fillStyle = withAlpha(o.buyColor ?? PROFILE_BUY, a);
    ctx.fillRect(anchor - wBuy, top, wBuy, h);
    ctx.fillStyle = withAlpha(o.sellColor ?? PROFILE_SELL, a);
    ctx.fillRect(anchor - wBuy - wSell, top, wSell, h);
  });
}
