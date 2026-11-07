// Escolhas da seção "Ativos Principais" (período do minigráfico e moeda de exibição), salvas num cookie.

export const MACRO_PERIODS = ["1D", "1S", "1M", "3M", "6M", "1A"] as const;
export type MacroPeriod = (typeof MACRO_PERIODS)[number];
export const MACRO_CURRENCIES = ["USD", "EUR", "JPY", "BRL", "BTC"] as const;
export type MacroCurrency = (typeof MACRO_CURRENCIES)[number];
export const CURRENCY_INFO: Record<MacroCurrency, { symbol: string; name: string }> = {
  USD: { symbol: "$", name: "Dólar" },
  EUR: { symbol: "€", name: "Euro" },
  JPY: { symbol: "¥", name: "Iene" },
  BRL: { symbol: "R$", name: "Real" },
  BTC: { symbol: "₿", name: "Bitcoin" },
};
/** Dias de cada período (minigráfico). 1D usa as velas de hora. */
export const PERIOD_DAYS: Record<MacroPeriod, number> = { "1D": 1, "1S": 7, "1M": 30, "3M": 91, "6M": 182, "1A": 365 };

/** Seletor compacto de cada seção (Câmbio, Indicadores, Bolsas e o período analisado em Ativos). */
export const SECTION_PERIODS = ["1D", "1S", "1M", "6M", "1A"] as const;
export type SectionPeriod = (typeof SECTION_PERIODS)[number];
export const SECTION_PERIOD_LABEL: Record<SectionPeriod, string> = { "1D": "Um dia", "1S": "Uma semana", "1M": "Um mês", "6M": "Seis meses", "1A": "Um ano" };

export type MacroPrefs = {
  /** Minigráfico dos ativos (barra). */
  period: MacroPeriod;
  currency: MacroCurrency;
  fx: SectionPeriod;
  indicators: SectionPeriod;
  markets: SectionPeriod;
  /** Período analisado em Ativos Principais (coluna de variação em destaque). */
  assets: SectionPeriod;
};
export const MACRO_COOKIE = "macro-ativos";
export const DEFAULT_MACRO_PREFS: MacroPrefs = { period: "1M", currency: "USD", fx: "1D", indicators: "1D", markets: "1D", assets: "1D" };

/** Só valores conhecidos; o resto volta ao padrão. */
export function parseMacroPrefs(raw: string | undefined): MacroPrefs {
  if (!raw) return { ...DEFAULT_MACRO_PREFS };
  try {
    const v = JSON.parse(raw.startsWith("%") ? decodeURIComponent(raw) : raw) as Record<string, unknown>;
    const sec = (k: "fx" | "indicators" | "markets" | "assets") =>
      (SECTION_PERIODS as readonly unknown[]).includes(v[k]) ? (v[k] as SectionPeriod) : DEFAULT_MACRO_PREFS[k];
    return {
      period: (MACRO_PERIODS as readonly unknown[]).includes(v.period) ? (v.period as MacroPeriod) : DEFAULT_MACRO_PREFS.period,
      currency: (MACRO_CURRENCIES as readonly unknown[]).includes(v.currency) ? (v.currency as MacroCurrency) : DEFAULT_MACRO_PREFS.currency,
      fx: sec("fx"),
      indicators: sec("indicators"),
      markets: sec("markets"),
      assets: sec("assets"),
    };
  } catch {
    return { ...DEFAULT_MACRO_PREFS };
  }
}

/** Preço em US$ → moeda escolhida (1 US$ = `usdIn[moeda]` unidades). Sem cotação: null (não inventa). */
export function convertUsd(usd: number | null, currency: MacroCurrency, usdIn: Record<Exclude<MacroCurrency, "USD">, number | null>): number | null {
  if (usd === null) return null;
  if (currency === "USD") return usd;
  const rate = usdIn[currency];
  return rate ? usd * rate : null;
}
