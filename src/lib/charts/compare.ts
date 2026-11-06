// Onde e como cada comparação aparece por padrão (sem dependências do navegador).
import { MACRO_SERIES } from "./macro-ids";
import { onchainInfo } from "./onchain-ids";
import type { CompareScale, CompareState } from "./workspace";

/** Painel: escolha da pessoa ou o padrão (juros do FRED em painel; o resto, inclusive on-chain, sobre o preço). */
export function compareDisplay(c: CompareState): "main" | "sub" {
  if (c.display) return c.display;
  if (c.kind === "macro") return MACRO_SERIES.find((m) => m.id === c.id)?.pane === "sub" ? "sub" : "main";
  return "main";
}

/**
 * Escala sobre o preço: escolha da pessoa ou o padrão — on-chain em US$ no BTCUSDT na própria escala do preço;
 * on-chain em outras unidades (pode ter zero ou negativos) encaixado na faixa do preço; pares e macro em % (rebase).
 */
export function compareScale(c: CompareState, symbol: string): CompareScale {
  if (c.scale) return c.scale;
  if (c.kind === "onchain") return onchainInfo(c.id)?.unit === "usd" && symbol === "BTCUSDT" ? "price" : "fit";
  return "percent";
}

export const COMPARE_SCALE_LABEL: Record<CompareScale, string> = {
  percent: "Percentual (começa no mesmo ponto do preço)",
  fit: "Escala própria (ajustada à faixa do preço)",
  price: "Mesma escala do preço (valor real)",
};
