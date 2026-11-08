// Mapa de liquidações (heatmap) e perfil lateral de liquidez — camadas do gráfico ligadas por botões próprios.
// São indicadores internos (não aparecem na lista de indicadores nem nas legendas) e não mexem no "Heatmap de
// liquidações" nem nos perfis de volume existentes.
//
// Dados: a mesma ESTIMATIVA do projeto — open interest do perpétuo na Binance Futures + faixas de alavancagem
// típicas (liquidationLevels). É uma estimativa, não as ordens reais de liquidação das corretoras.
//
// - LIQ_MAP: atrás das velas (zLevel negativo), linhas por faixa de preço coloridas pela liquidez ainda não liquidada
//   em cada momento (azul = baixa ... vermelho = alta, relativa à área visível), como nos mapas de liquidação usuais.
// - Perfil lateral (drawSideProfile): tela própria colada na lateral direita da área do gráfico, por cima de tudo, sobre a faixa de preço visível: liquidez que
//   seria liquidada em cada faixa (só níveis ainda não atingidos), com os acumulados a partir do preço atual
//   (vendidos acima, comprados abaixo) e os totais nas pontas. Sem "girar".
import { registerIndicator, type KLineData } from "klinecharts";
import { heatColor, liquidationHeatGrid, liquidationLevels, liquiditySideProfile, type LiqLevel, type SideProfile } from "@/lib/charts/indicators";

export const LIQ_MAP = "LIQ_MAP";
/** Largura da faixa lateral (px). */
export const SIDE_WIDTH = 124;

type LiqData = { oi: [number, number][]; status?: string };
const bars = (d: KLineData[]) => d.map((b) => ({ ...b, volume: b.volume ?? 0 }));

/** Níveis calculados uma vez por conjunto de velas + open interest (compartilhado pelas duas camadas). */
let levelsMemo: { key: string; oi: unknown; levels: LiqLevel[] } | null = null;
function levelsFor(data: KLineData[], oi: [number, number][]): LiqLevel[] {
  const key = `${data.length}:${data[0].timestamp}:${data[data.length - 1].timestamp}:${data[data.length - 1].close}`;
  if (!levelsMemo || levelsMemo.key !== key || levelsMemo.oi !== oi) levelsMemo = { key, oi, levels: liquidationLevels(bars(data), oi) };
  return levelsMemo.levels;
}

type Axis = { convertToPixel: (v: number) => number; convertFromPixel: (p: number) => number };

/** Faixa de preço visível (de baixo para cima). */
function visiblePrices(yAxis: Axis, height: number): [number, number] | null {
  const a = yAxis.convertFromPixel(height);
  const b = yAxis.convertFromPixel(0);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !(b > a)) return null;
  return [a, b];
}

const money = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}B`;
  if (a >= 1e6) return `$${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  if (a >= 1e3) return `$${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}K`;
  return `$${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
};

/** Geometria da faixa lateral desenhada por último (para a dica ao passar o mouse). */
type SideHitArea = { x0: number; width: number; height: number; lo: number; hi: number; rows: number; profile: SideProfile };
const sideAreas = new Map<string, SideHitArea>();

/** O que está sob o cursor na faixa lateral (coordenadas da própria faixa): faixa de preço e liquidez; null fora dela. */
export function liqSideHit(indicatorId: string, x: number, y: number): { from: number; to: number; value: number } | null {
  const a = sideAreas.get(indicatorId);
  if (!a || x < a.x0 || x > a.x0 + a.width || y < 0 || y > a.height) return null;
  const price = a.hi - (y / a.height) * (a.hi - a.lo);
  const step = (a.hi - a.lo) / a.rows;
  const r = Math.min(a.rows - 1, Math.max(0, Math.floor((price - a.lo) / step)));
  return { from: a.lo + r * step, to: a.lo + (r + 1) * step, value: a.profile.rows[r]?.value ?? 0 };
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
      if (!indicator.visible || !oi.length || data.length < 2) return true;
      const prices = visiblePrices(yAxis as unknown as Axis, bounding.height);
      if (!prices) return true;
      const [lo, hi] = prices;
      const levels = levelsFor(data, oi);
      const range = chart.getVisibleRange();
      // Linhas de ~5 px, como nas referências.
      const rows = Math.max(40, Math.min(220, Math.round(bounding.height / 5)));
      const grid = liquidationHeatGrid(levels, Math.max(0, range.from - 1), Math.min(data.length - 1, range.to), lo, hi, rows, data.length - 1);
      if (!grid.max) return true;
      const step = (hi - lo) / rows;
      const half = chart.getBarSpace().bar / 2;
      ctx.save();
      for (const s of grid.segments) {
        const x1 = xAxis.convertToPixel(s.from) - half;
        // Nível ainda ativo na última vela: segue até a borda direita (o que vem pela frente).
        const x2 = s.to > data.length - 1 ? bounding.width : xAxis.convertToPixel(s.to) - half;
        if (x2 < 0 || x1 > bounding.width) continue;
        const yTop = yAxis.convertToPixel(lo + (s.row + 1) * step);
        const yBot = yAxis.convertToPixel(lo + s.row * step);
        const t = Math.sqrt(s.value / grid.max);
        ctx.fillStyle = heatColor(t, 0.35 + 0.6 * t);
        ctx.fillRect(Math.max(0, x1), Math.min(yTop, yBot), Math.max(1, Math.min(bounding.width, x2) - Math.max(0, x1)), Math.max(1, Math.abs(yBot - yTop) - 0.5));
      }
      // Legenda (por cima de tudo): intensidade relativa e a natureza estimada dos dados.
      ctx.globalCompositeOperation = "source-over";
      const lx = 10;
      // Um pouco acima do rodapé (onde outros desenhos escrevem as notas deles).
      const ly = bounding.height - 44;
      ctx.font = "10px Geist, sans-serif";
      ctx.fillStyle = "#d4d4d8";
      ctx.fillText("Intensidade relativa  Baixa", lx, ly);
      const gx = lx + ctx.measureText("Intensidade relativa  Baixa").width + 6;
      const grad = ctx.createLinearGradient(gx, 0, gx + 80, 0);
      for (const p of [0, 0.25, 0.5, 0.75, 1]) grad.addColorStop(p, heatColor(p));
      ctx.fillStyle = grad;
      ctx.fillRect(gx, ly - 6, 80, 4);
      ctx.fillStyle = "#d4d4d8";
      ctx.fillText("Alta", gx + 86, ly);
      ctx.fillStyle = "#71717a";
      ctx.fillText("Mapa de liquidações estimado (open interest Binance Futures + alavancagem típica)", lx, ly + 13);
      ctx.restore();
      return true;
    },
  });
}

/**
 * Perfil lateral desenhado numa tela própria sobre a lateral direita do gráfico (por cima das velas, indicadores e
 * desenhos). `yOf` converte preço em pixel da área do gráfico; `height` é a altura dessa área.
 */
export function drawSideProfile(
  ctx: CanvasRenderingContext2D,
  o: { key: string; width: number; height: number; lo: number; hi: number; data: KLineData[]; oi: [number, number][]; status?: string; yOf: (price: number) => number },
): void {
  const { width: W, height, lo, hi, yOf } = o;
  ctx.clearRect(0, 0, W, height);
  ctx.fillStyle = "rgba(9, 9, 11, 0.94)";
  ctx.fillRect(0, 0, W, height);
  ctx.fillStyle = "rgba(139, 124, 246, 0.35)";
  ctx.fillRect(0, 0, 1, height);
  if (!o.oi.length || o.data.length < 2 || !(hi > lo)) {
    ctx.fillStyle = "#71717a";
    ctx.font = "10px Geist, sans-serif";
    ctx.fillText(o.status ?? "Carregando...", 8, 18);
    sideAreas.delete(o.key);
    return;
  }
  const rows = Math.max(30, Math.min(160, Math.round(height / 5)));
  const price = o.data[o.data.length - 1].close;
  const profile = liquiditySideProfile(levelsFor(o.data, o.oi), lo, hi, rows, price);
  sideAreas.set(o.key, { x0: 0, width: W, height, lo, hi, rows, profile });
  const step = (hi - lo) / rows;
  const rowY = (r: number) => yOf(lo + (r + 0.5) * step);
  const right = W - 3;
  const inner = W - 12;
  // Barras por faixa (ancoradas à direita), na mesma escala de cores do mapa.
  if (profile.max > 0) {
    for (let r = 0; r < rows; r++) {
      const v = profile.rows[r].value;
      if (!v) continue;
      const len = Math.max(1, (v / profile.max) * inner);
      const yTop = yOf(lo + (r + 1) * step);
      const yBot = yOf(lo + r * step);
      ctx.fillStyle = heatColor(v / profile.max, 0.9);
      ctx.fillRect(right - len, Math.min(yTop, yBot) + 0.5, len, Math.max(1, Math.abs(yBot - yTop) - 1.5));
    }
  }
  // Acumulados a partir do preço atual: vendidos acima (verde-água), comprados abaixo (laranja).
  const maxCum = Math.max(profile.totalAbove, profile.totalBelow);
  const curve = (cum: number[], from: number, to: number, stroke: string, fill: string) => {
    if (!maxCum) return;
    const pts: [number, number][] = [];
    for (let r = from; from <= to ? r <= to : r >= to; r += from <= to ? 1 : -1) pts.push([right - (cum[r] / maxCum) * inner, rowY(r)]);
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(right, pts[0][1]);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(right, pts[pts.length - 1][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  };
  const cur = Math.min(rows - 1, Math.max(0, Math.floor((price - lo) / step)));
  curve(profile.cumAbove, cur, rows - 1, "#2dd4bf", "rgba(45, 212, 191, 0.10)");
  curve(profile.cumBelow, cur, 0, "#f59e0b", "rgba(245, 158, 11, 0.12)");
  // Totais nas pontas.
  ctx.font = "600 10px Geist, sans-serif";
  ctx.fillStyle = "#2dd4bf";
  ctx.fillText(money(profile.totalAbove), 6, 13);
  ctx.fillStyle = "#f59e0b";
  ctx.fillText(money(profile.totalBelow), 6, height - 6);
}
