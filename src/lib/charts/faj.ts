// FAJ Dogepack (FiatEaterJens) — padrões de fábrica do script original (cores, níveis e transparências do Pine).
// Transparência do Pine (0 = opaco, 100 = invisível) → opacidade no canal alfa: 75 → 25% (40), 80 → 20% (33).

/** RSI amarelo, 2 px. */
export const FAJ_RSI_COLOR = "#FFF900";
/** EMA do RSI: color.lime (subindo ou igual) e color.red (descendo) do Pine. */
export const FAJ_EMA_UP = "#00E676";
export const FAJ_EMA_DOWN = "#FF5252";
/** Fundo: ciano #00F4FF com 75% de transparência (alta) e violeta #7E57C2 com 80% (baixa). */
export const FAJ_FILL_UP = "#00F4FF40";
export const FAJ_FILL_DOWN = "#7E57C233";
/** Níveis: chave da série, nome, valor e cor original. */
export const FAJ_LEVELS: [key: string, title: string, value: number, color: string][] = [
  ["l80", "Upper Bull (80)", 80, "#008B9D"],
  ["l65", "Lower Bull (65)", 65, "#008B9D"],
  ["l50", "Midline (50)", 50, "#FFFFFF"],
  ["l45", "Upper Bear (45)", 45, "#9160E6"],
  ["l20", "Lower Bear (20)", 20, "#9160E6"],
];
export const isFajLevel = (key: string) => FAJ_LEVELS.some(([k]) => k === key);
