import { heatRgb } from "./indicators";

/**
 * Cor do mapa já SUAVIZADA para ficar atrás das velas: mesma escala e mesma ordem de intensidade (azul → vermelho),
 * mas as cores quentes perdem saturação e brilho aos poucos (a partir do verde) e a opacidade vai de 28% a 70%.
 * Só o visual; o valor e a intensidade calculados não mudam.
 */
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function softHeat(t: number): [number, number, number, number] {
  const [r, g, b] = heatRgb(t);
  const warm = smooth(0.5, 1, t);
  const gray = 0.3 * r + 0.59 * g + 0.11 * b;
  const desat = 0.12 + 0.23 * warm;
  const dim = 1 - 0.2 * warm;
  const mix = (c: number) => Math.round((c * (1 - desat) + gray * desat) * dim);
  return [mix(r), mix(g), mix(b), 0.28 + 0.42 * Math.max(0, Math.min(1, t))];
}
