// Cores das telas de cartões (tema escuro).
export const NATURE_COLOR = { PF: "#4C66DD", PJ: "#22C55E" } as const;

const CATEGORY_HUES = ["#4ADE80", "#A78BFA", "#60A5FA", "#FB923C", "#F87171", "#FACC15", "#F472B6", "#38BDF8", "#2DD4BF", "#818CF8", "#E879F9", "#FDBA74", "#A3E635"];

/** Cor da categoria pela ordem de criação (id): as categorias padrão saem todas com cores diferentes. */
export function categoryColor(id: number | null): string {
  if (id === null) return "#94A3B8";
  return CATEGORY_HUES[(((id - 1) % CATEGORY_HUES.length) + CATEGORY_HUES.length) % CATEGORY_HUES.length];
}

/** Etiqueta com fundo translúcido da cor e texto na própria cor. */
export function tagStyle(color: string): React.CSSProperties {
  return { color, backgroundColor: `${color}26`, borderColor: `${color}55` };
}
