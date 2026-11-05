// Cores das telas de cartões (tema escuro).
export const CARD_COLOR = { PF: "#28A38C", PJ: "#9470E7" } as const;
export const NATURE_COLOR = { PF: "#4C66DD", PJ: "#22C55E" } as const;

const CATEGORY_HUES = ["#A78BFA", "#60A5FA", "#FB923C", "#4ADE80", "#FACC15", "#38BDF8", "#F472B6", "#2DD4BF", "#F87171", "#C084FC", "#A3E635", "#FDBA74", "#94A3B8"];

/** Cor estável por nome de categoria (a mesma categoria tem sempre a mesma cor). */
export function categoryColor(name: string | null): string {
  if (!name) return "#94A3B8";
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return CATEGORY_HUES[h % CATEGORY_HUES.length];
}

/** Etiqueta com fundo translúcido da cor e texto na própria cor. */
export function tagStyle(color: string): React.CSSProperties {
  return { color, backgroundColor: `${color}26`, borderColor: `${color}55` };
}
