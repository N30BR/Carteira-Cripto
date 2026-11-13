/** Cores da variação da vela (mesmas das velas de alta/baixa) e neutra. */
export const CHANGE_COLORS = { up: "#22c55e", down: "#ef4444", flat: "#a1a1aa" } as const;

/**
 * Variação da vela: (fechamento − abertura) / abertura × 100, com 2 casas, sinal "+" ou "−" e a cor.
 * Sem abertura/fechamento válidos (ou abertura zero) devolve null: a legenda mostra "Ø".
 */
export function candleChange(open: number | undefined, close: number | undefined): { text: string; color: string } | null {
  if (typeof open !== "number" || typeof close !== "number" || !Number.isFinite(open) || !Number.isFinite(close) || open === 0) return null;
  const pct = ((close - open) / open) * 100;
  const rounded = Math.round(pct * 100) / 100;
  if (rounded === 0) return { text: "0.00%", color: CHANGE_COLORS.flat };
  const abs = Math.abs(rounded).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return rounded > 0 ? { text: `+${abs}%`, color: CHANGE_COLORS.up } : { text: `−${abs}%`, color: CHANGE_COLORS.down };
}
