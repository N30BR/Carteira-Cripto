// Regras das ferramentas de desenho (sem dependências do navegador).
import type { FibLevel } from "./workspace";

/** Cores do MA Ribbon NEO (MA 25, 30, 35, 40, 45, 50, 100, 200), tiradas das referências. */
export const NEO_COLORS = ["#2196F3", "#2157F3", "#2A21F3", "#6921F3", "#A821F3", "#E721F3", "#FFFFFF", "#FFFFFF"];

/** Níveis padrão da retração de Fibonacci (mesmos níveis de antes; cores na identidade das médias). */
export const DEFAULT_FIB_LEVELS: FibLevel[] = [
  { value: 0, color: NEO_COLORS[0], visible: true },
  { value: 0.236, color: NEO_COLORS[1], visible: true },
  { value: 0.382, color: NEO_COLORS[2], visible: true },
  { value: 0.5, color: NEO_COLORS[3], visible: true },
  { value: 0.618, color: NEO_COLORS[4], visible: true },
  { value: 0.786, color: NEO_COLORS[5], visible: true },
  { value: 1, color: NEO_COLORS[6], visible: true },
];

/**
 * Preço de um nível: o primeiro ponto clicado é o nível 1 e o segundo é o nível 0,
 * qualquer que seja a direção (não inverte pela posição maior/menor do preço).
 */
export function fibPrice(first: number, second: number, level: number): number {
  return second + (first - second) * level;
}

/** Índice da vela que contém o horário (a última com início ≤ horário); fora da faixa, a da ponta. */
export function findBarIndex(timestamps: number[], ts: number): number {
  if (!timestamps.length) return -1;
  let lo = 0;
  let hi = timestamps.length - 1;
  if (ts <= timestamps[0]) return 0;
  if (ts >= timestamps[hi]) return hi;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (timestamps[mid] <= ts) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
