// Indicadores on-chain do Bitcoin para "Comparar na mesma janela" (sem dependências: cliente e servidor).

export type OnchainId =
  | "MVRV_Z"
  | "NUPL"
  | "SOPR"
  | "STH_SOPR"
  | "REALIZED_PRICE"
  | "STH_REALIZED_PRICE"
  | "PUELL"
  | "RHODL"
  | "RESERVE_RISK"
  | "EXCHANGE_NETFLOW";

export type OnchainInfo = {
  id: OnchainId;
  name: string;
  short: string;
  description: string;
  purpose: string;
  /** "usd" pode ficar sobre o preço do BTC; "ratio"/"btc" ficam em painel próprio (escala independente). */
  unit: "usd" | "ratio" | "btc";
  source: "coinmetrics" | "bgeometrics";
  /** Linha de referência (ex.: SOPR = 1). */
  reference?: number;
  /** Observação sobre a fonte gratuita (atraso, cálculo). */
  note?: string;
};

export const ONCHAIN_SERIES: OnchainInfo[] = [
  {
    id: "MVRV_Z",
    name: "Market Value to Realized Value Z-Score",
    short: "MVRV Z-Score",
    description: "Distância entre o valor de mercado e o valor realizado, em desvios-padrão do valor de mercado.",
    purpose: "Topos e fundos de ciclo: muito alto = superaquecimento; muito baixo = subvalorização.",
    unit: "ratio",
    source: "coinmetrics",
    reference: 0,
    note: "Calculado com dados gratuitos da Coin Metrics (desvio-padrão acumulado até cada data).",
  },
  {
    id: "NUPL",
    name: "Net Unrealized Profit/Loss",
    short: "NUPL",
    description: "Lucro ou prejuízo não realizado agregado: (valor de mercado − valor realizado) ÷ valor de mercado.",
    purpose: "Sentimento e ciclos: alto = euforia; negativo = prejuízo agregado e possível capitulação.",
    unit: "ratio",
    source: "coinmetrics",
    reference: 0,
    note: "Calculado com dados gratuitos da Coin Metrics (1 − 1/MVRV).",
  },
  {
    id: "SOPR",
    name: "Spent Output Profit Ratio",
    short: "SOPR",
    description: "Razão entre o preço de venda e o de aquisição das moedas movimentadas no dia.",
    purpose: "Realização de lucros e reversões: acima de 1 = vendas com lucro; abaixo de 1 = com prejuízo.",
    unit: "ratio",
    source: "bgeometrics",
    reference: 1,
    note: "BGeometrics, plano gratuito: os últimos 7 dias chegam com atraso.",
  },
  {
    id: "STH_SOPR",
    name: "Short-Term Holder SOPR",
    short: "STH-SOPR",
    description: "SOPR só das moedas movimentadas por investidores de curto prazo (menos de ~155 dias).",
    purpose: "Tendência e comportamento de curto prazo: a região de 1 funciona como referência.",
    unit: "ratio",
    source: "bgeometrics",
    reference: 1,
    note: "BGeometrics, plano gratuito: os últimos 7 dias chegam com atraso.",
  },
  {
    id: "REALIZED_PRICE",
    name: "Preço Realizado do Bitcoin",
    short: "Realized Price",
    description: "Custo médio de aquisição estimado das moedas, pela última movimentação on-chain de cada uma.",
    purpose: "Fundos de ciclo e valuation: BTC abaixo dele costuma indicar estresse.",
    unit: "usd",
    source: "coinmetrics",
    note: "Calculado com dados gratuitos da Coin Metrics (valor de mercado ÷ MVRV ÷ oferta).",
  },
  {
    id: "STH_REALIZED_PRICE",
    name: "Short-Term Holder Realized Price",
    short: "STH Realized Price",
    description: "Custo médio de aquisição dos investidores de curto prazo.",
    purpose: "Suporte, resistência e tendência: BTC acima sustenta a tendência; abaixo pressiona os recentes.",
    unit: "usd",
    source: "bgeometrics",
    note: "BGeometrics, plano gratuito: os últimos 7 dias chegam com atraso.",
  },
  {
    id: "PUELL",
    name: "Puell Multiple",
    short: "Puell",
    description: "Receita diária de emissão dos mineradores (US$) ÷ média de 365 dias dessa receita.",
    purpose: "Topos, fundos e mineração: alto = lucratividade extrema; baixo = estresse dos mineradores.",
    unit: "ratio",
    source: "coinmetrics",
    reference: 1,
    note: "Calculado com a emissão diária em US$ da Coin Metrics (gratuita).",
  },
  {
    id: "RHODL",
    name: "Realized HODL Ratio",
    short: "RHODL",
    description: "Compara o valor realizado das moedas de 1 semana com o das de 1 a 2 anos.",
    purpose: "Topos de ciclo: valores elevados apareceram em fases avançadas de ciclos.",
    unit: "ratio",
    source: "bgeometrics",
  },
  {
    id: "RESERVE_RISK",
    name: "Reserve Risk",
    short: "Reserve Risk",
    description: "Preço do BTC em relação à convicção (custo de oportunidade) dos investidores de longo prazo.",
    purpose: "Valuation: baixo = regiões historicamente atrativas; alto = menor margem de segurança.",
    unit: "ratio",
    source: "bgeometrics",
  },
  {
    id: "EXCHANGE_NETFLOW",
    name: "Fluxo Líquido das Exchanges",
    short: "Exchange Netflow",
    description: "Entradas − saídas de BTC nas exchanges no dia (em BTC).",
    purpose: "Fluxos de capital: positivo = mais BTC disponível para venda; negativo = saída para custódia.",
    unit: "btc",
    source: "coinmetrics",
    reference: 0,
    note: "Coin Metrics (gratuita), exchanges que ela acompanha.",
  },
];
export const ONCHAIN_IDS = ONCHAIN_SERIES.map((s) => s.id);
export const onchainInfo = (id: string) => ONCHAIN_SERIES.find((s) => s.id === id);
