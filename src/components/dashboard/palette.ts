// Cores do dashboard (tema escuro). A ordem segue a do donut: maior fatia primeiro.
export const ACCENT = "#8b7cf6";
export const UP = "#22c55e";
export const DOWN = "#ef4444";
export const CATEGORICAL = ["#8b7cf6", "#2dd4bf", "#f59e0b", "#38bdf8", "#fb7185", "#a3e635", "#fb923c"];
export const OTHERS = "#737373";

/** Cores oficiais dos tokens (pedidas pelo usuário); as demais moedas usam a paleta acima. */
const COIN_COLORS: Record<string, string> = {
  BTC: "#F7931A",
  ETH: "#4B5563",
  USDT: "#26A17B",
  SOL: "#9945FF",
  LINK: "#2A5ADA",
  AAVE: "#7C6CFF",
  TAO: "#8B8F97",
  XLM: "#1F2937",
  NEAR: "#FFFFFF",
};

export function coinColor(symbol: string): string | null {
  return COIN_COLORS[symbol.toUpperCase()] ?? null;
}
