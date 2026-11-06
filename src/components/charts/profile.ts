// Desenho do perfil de volume (indicador da faixa visível e ferramenta de faixa fixa), no canvas do gráfico.
import type { VolumeProfile } from "@/lib/charts/indicators";

/** Cores padrão: compras (verde) e vendas (vermelho). */
export const PROFILE_BUY = "#22c55e";
export const PROFILE_SELL = "#ef4444";

export type ProfileOpts = {
  /** x onde as barras começam (crescem para a esquerda); o perfil de sentimento fica à direita. */
  anchorX: number;
  width: number;
  /** Largura máxima do perfil de sentimento (compras − vendas por faixa); 0 = sem ele. */
  sentiment: number;
  /** Trecho das linhas do POC, VAH e VAL. */
  lineFrom: number;
  lineTo: number;
  y: (price: number) => number;
  buyColor: string;
  sellColor: string;
};

/** Multiplica a transparência da cor (mantendo a que a pessoa escolheu). */
export function withAlpha(c: string, a: number): string {
  const base = c.slice(0, 7);
  const own = c.length === 9 ? parseInt(c.slice(7), 16) / 255 : 1;
  const v = Math.round(Math.max(0, Math.min(1, own * a)) * 255);
  return `${base}${v.toString(16).padStart(2, "0")}`;
}

/**
 * Cada faixa de preço vira uma barra horizontal com dois segmentos — compras (junto à âncora) e vendas
 * (em seguida) —, com comprimento proporcional ao volume da faixa. A barra fica exatamente entre os preços
 * da faixa (acompanha zoom, arraste e escala log). Fora da área de valor, mais apagada; o POC, mais forte.
 */
export function drawProfile(ctx: CanvasRenderingContext2D, vp: VolumeProfile, o: ProfileOpts): void {
  if (!vp.bins.length || vp.pocIndex < 0) return;
  const max = Math.max(...vp.bins.map((b) => b.volume)) || 1;
  const maxDelta = Math.max(...vp.bins.map((b) => Math.abs(b.buy - b.sell))) || 1;
  ctx.save();
  vp.bins.forEach((b, i) => {
    const yTop = o.y(b.to);
    const yBottom = o.y(b.from);
    const top = Math.min(yTop, yBottom);
    const h = Math.max(1, Math.abs(yBottom - yTop) - 1);
    const inValue = b.from >= vp.valueArea.low - 1e-12 && b.to <= vp.valueArea.high + 1e-12;
    const a = i === vp.pocIndex ? 1 : inValue ? 0.8 : 0.35;
    const wBuy = (b.buy / max) * o.width;
    const wSell = (b.sell / max) * o.width;
    ctx.fillStyle = withAlpha(o.buyColor, a);
    ctx.fillRect(o.anchorX - wBuy, top, wBuy, h);
    ctx.fillStyle = withAlpha(o.sellColor, a);
    ctx.fillRect(o.anchorX - wBuy - wSell, top, wSell, h);
    if (o.sentiment > 0) {
      const d = b.buy - b.sell;
      ctx.fillStyle = withAlpha(d >= 0 ? o.buyColor : o.sellColor, 0.85);
      ctx.fillRect(o.anchorX + 2, top, (Math.abs(d) / maxDelta) * o.sentiment, h);
    }
  });
  // Eixo do perfil (separa as barras do sentimento).
  const yHi = o.y(vp.bins[vp.bins.length - 1].to);
  const yLo = o.y(vp.bins[0].from);
  ctx.fillStyle = "#a1a1aa66";
  ctx.fillRect(Math.round(o.anchorX), Math.min(yHi, yLo), 1, Math.abs(yLo - yHi));
  const poc = vp.bins[vp.pocIndex];
  const line = (price: number, color: string, label: string) => {
    const y = Math.round(o.y(price)) + 0.5;
    ctx.strokeStyle = color;
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(o.lineFrom, y);
    ctx.lineTo(o.lineTo, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "10px Geist, sans-serif";
    ctx.fillStyle = color;
    ctx.textBaseline = "bottom";
    ctx.fillText(label, o.lineFrom + 4, y - 2);
  };
  line((poc.from + poc.to) / 2, "#facc15", "POC");
  line(vp.valueArea.high, "#60a5fa", "VAH");
  line(vp.valueArea.low, "#60a5fa", "VAL");
  ctx.restore();
}
