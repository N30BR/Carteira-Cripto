// Regras das ferramentas de desenho (sem dependências do navegador).
import type { FibLevel } from "./workspace";

/** Níveis padrão da retração de Fibonacci (cores como na referência). */
export const DEFAULT_FIB_LEVELS: FibLevel[] = [
  { value: 0, color: "#787b86", visible: true },
  { value: 0.236, color: "#f23645", visible: true },
  { value: 0.382, color: "#ff9800", visible: true },
  { value: 0.5, color: "#4caf50", visible: true },
  { value: 0.618, color: "#089981", visible: true },
  { value: 0.786, color: "#00bcd4", visible: true },
  { value: 1, color: "#787b86", visible: true },
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
