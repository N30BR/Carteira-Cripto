// Séries macro disponíveis para comparação (sem dependências: usado no cliente e no servidor).
export type MacroId = "FED_FUNDS" | "UST10Y" | "US_M2" | "FED_NET_LIQUIDITY" | "GLOBAL_LIQUIDITY";

/** "sub" = painel próprio com o valor real; "main" = na janela do preço, com rebase (desempenho relativo). */
export const MACRO_SERIES: { id: MacroId; label: string; unit: string; pane: "main" | "sub" }[] = [
  { id: "FED_FUNDS", label: "Juros EUA — Fed Funds", unit: "%", pane: "sub" },
  { id: "UST10Y", label: "Juros EUA — Treasury 10 anos", unit: "%", pane: "sub" },
  { id: "US_M2", label: "M2 dos EUA", unit: "US$ tri", pane: "main" },
  { id: "FED_NET_LIQUIDITY", label: "Liquidez líquida do Fed (balanço − Tesouro − reverse repo)", unit: "US$ tri", pane: "main" },
  { id: "GLOBAL_LIQUIDITY", label: "Liquidez global aprox. (balanços Fed + BCE + BoJ)", unit: "US$ tri", pane: "main" },
];
export const MACRO_IDS = MACRO_SERIES.map((m) => m.id);
