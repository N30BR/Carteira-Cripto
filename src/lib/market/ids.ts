// Séries de mercado cripto (capitalização e dominância): definições sem dependências (cliente e servidor).
// Os ids são uma lista fechada: só eles valem como "instrumento de mercado" nos Gráficos e no Comparar.

export const MARKET_IDS = ["TOTAL", "TOTAL2", "TOTAL3", "OTHERS", "BTC.D", "ETH.D", "USDT.D", "USDC.D", "STABLE.D"] as const;
export type MarketId = (typeof MARKET_IDS)[number];

export type MarketInfo = {
  id: MarketId;
  /** Nome curto (como no TradingView). */
  short: string;
  name: string;
  description: string;
  /** "usd": capitalização em US$; "pct": dominância em % do total. */
  unit: "usd" | "pct";
  /** Palavras para a busca (português e inglês). */
  keywords: string;
};

export const MARKET_SERIES: MarketInfo[] = [
  {
    id: "TOTAL",
    short: "TOTAL",
    name: "Capitalização total do mercado cripto",
    description: "Soma do valor de mercado de todas as criptomoedas.",
    unit: "usd",
    keywords: "market cap total capitalização mercado",
  },
  {
    id: "TOTAL2",
    short: "TOTAL2",
    name: "Capitalização total sem Bitcoin",
    description: "Valor de mercado de todas as criptomoedas, exceto o Bitcoin (altcoins, inclusive stablecoins).",
    unit: "usd",
    keywords: "market cap altcoins sem btc capitalização",
  },
  {
    id: "TOTAL3",
    short: "TOTAL3",
    name: "Capitalização total sem Bitcoin e Ethereum",
    description: "Valor de mercado de todas as criptomoedas, exceto Bitcoin e Ethereum.",
    unit: "usd",
    keywords: "market cap altcoins sem btc eth capitalização",
  },
  {
    id: "OTHERS",
    short: "OTHERS",
    name: "Capitalização fora das 10 maiores",
    description: "Valor de mercado das criptomoedas fora das 10 maiores por capitalização.",
    unit: "usd",
    keywords: "others outras altcoins menores capitalização",
  },
  {
    id: "BTC.D",
    short: "BTC.D",
    name: "Dominância do Bitcoin",
    description: "Participação do Bitcoin na capitalização total.",
    unit: "pct",
    keywords: "dominância bitcoin btc dominance",
  },
  {
    id: "ETH.D",
    short: "ETH.D",
    name: "Dominância do Ethereum",
    description: "Participação do Ethereum na capitalização total.",
    unit: "pct",
    keywords: "dominância ethereum eth dominance",
  },
  {
    id: "USDT.D",
    short: "USDT.D",
    name: "Dominância do USDT",
    description: "Participação do Tether (USDT) na capitalização total.",
    unit: "pct",
    keywords: "dominância tether usdt stablecoin dominance",
  },
  {
    id: "USDC.D",
    short: "USDC.D",
    name: "Dominância do USDC",
    description: "Participação do USD Coin (USDC) na capitalização total.",
    unit: "pct",
    keywords: "dominância usdc usd coin stablecoin dominance",
  },
  {
    id: "STABLE.D",
    short: "Stable.D",
    name: "Dominância agregada das stablecoins",
    description: "Participação de todas as stablecoins (lista da DefiLlama, sem dupla contagem) na capitalização total.",
    unit: "pct",
    keywords: "dominância stablecoins stable agregada dominance",
  },
];

export const isMarketId = (s: string): s is MarketId => (MARKET_IDS as readonly string[]).includes(s);
export const marketInfo = (id: string) => MARKET_SERIES.find((m) => m.id === id);

/**
 * Pares invertidos (não existem na Binance): saem das velas reais do par oposto, com os preços invertidos
 * (abertura = 1/abertura, máxima = 1/mínima, mínima = 1/máxima, fechamento = 1/fechamento). Mesmos dados, outra unidade.
 * - BTC/ETH: quantos ETH vale 1 BTC (ETH/BTC invertido).
 * - USDTUSD/BTCUSD: (preço do USDT em US$) ÷ (preço do BTC em US$) = quanto 1 USDT vale em BTC (BTC/USDT invertido).
 */
export type InvertedPair = { source: string; label: string; name: string; keywords: string };
export const INVERTED_PAIRS: Record<string, InvertedPair> = {
  BTCETH: { source: "ETHBTC", label: "BTC/ETH", name: "Bitcoin em Ethereum (ETH/BTC invertido)", keywords: "btc eth razão inverso" },
  USDTBTC: {
    source: "BTCUSDT",
    label: "USDTUSD/BTCUSD",
    name: "Dólar (USDT) em Bitcoin — BTC/USDT invertido",
    keywords: "usdtusd btcusd usdt btc dólar dolar bitcoin razão inverso",
  },
};
export const invertedPair = (symbol: string): InvertedPair | undefined => (Object.hasOwn(INVERTED_PAIRS, symbol) ? INVERTED_PAIRS[symbol] : undefined);

/** Nome de exibição de um instrumento (par invertido e séries de mercado têm nome próprio). */
export function instrumentLabel(symbol: string, fallback: (s: string) => string): string {
  return invertedPair(symbol)?.label ?? marketInfo(symbol)?.short ?? fallback(symbol);
}

/** Instrumento de mercado (série diária, desenhada como linha/área; sem velas inventadas). */
export const isLineInstrument = (symbol: string) => isMarketId(symbol);
