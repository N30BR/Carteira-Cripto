// Estado das abas da aba Gráficos (o que é salvo na conta) e a validação de tudo que vem do navegador.
// Sem dependências de banco ou navegador: usado no servidor (actions) e no cliente (tela).
import { MACRO_IDS, type MacroId } from "./macro-ids";
import { ONCHAIN_IDS, type OnchainId } from "./onchain-ids";
import { CHART_INTERVALS, splitSymbol, type ChartInterval } from "./params";
import { MARKET_IDS, isMarketId, type MarketId } from "@/lib/market/ids";

export const CHART_TYPES = ["candle", "ohlc", "area", "line"] as const;
export type ChartType = (typeof CHART_TYPES)[number];
export const CHART_SCALES = ["normal", "logarithm", "percentage"] as const;
export type ChartScale = (typeof CHART_SCALES)[number];
export const CHART_LAYOUTS = [1, 2, 4, 8] as const;
export type ChartLayout = (typeof CHART_LAYOUTS)[number];

export const LIMITS = {
  tabs: 10,
  tabName: 30,
  indicatorsPerPane: 50,
  paramsPerIndicator: 10,
  overlaysPerPane: 300,
  pointsPerOverlay: 10,
  overlayText: 200,
  comparesPerPane: 10,
  /** Tamanho máximo do estado de uma aba salvo no banco (JSON). */
  stateBytes: 400_000,
};

/** Indicadores disponíveis: nome interno, rótulo e onde aparecem por padrão. */
export const CHART_INDICATORS: { name: string; label: string; pane: "main" | "sub"; params: number[] }[] = [
  // No gráfico de preço
  { name: "MA", label: "Média móvel (MA)", pane: "main", params: [5, 10, 30, 60] },
  { name: "EMA", label: "Média exponencial (EMA)", pane: "main", params: [6, 12, 20] },
  { name: "SMA", label: "Média suavizada (SMA)", pane: "main", params: [12, 2] },
  { name: "MA_RIBBON", label: "MA ribbon (EMA 10/30/50/100)", pane: "main", params: [10, 30, 50, 100] },
  { name: "MA_RIBBON_NEO", label: "MA Ribbon NEO (8 médias: 25 a 200)", pane: "main", params: [25, 30, 35, 40, 45, 50, 100, 200] },
  { name: "BOLL", label: "Bandas de Bollinger", pane: "main", params: [20, 2] },
  { name: "VWAP", label: "VWAP", pane: "main", params: [] },
  { name: "SAR", label: "Parabolic SAR", pane: "main", params: [2, 2, 20] },
  { name: "BBI", label: "BBI", pane: "main", params: [3, 6, 12, 24] },
  { name: "ICHIMOKU", label: "Ichimoku", pane: "main", params: [9, 26, 52] },
  { name: "VOLUME_PROFILE", label: "Volume Profile (faixa visível)", pane: "main", params: [24, 70] },
  { name: "BMSB", label: "Bull Market Support Band (20W SMA / 21W EMA)", pane: "main", params: [20, 21] },
  { name: "PI_CYCLE", label: "Pi Cycle Top (111 DMA / 2×350 DMA)", pane: "main", params: [111, 350] },
  { name: "AVP", label: "Preço médio (AVP)", pane: "main", params: [] },
  { name: "LIQ_HEATMAP", label: "Heatmap de liquidações (estimado)", pane: "main", params: [] },
  // Em painel próprio
  { name: "VOL", label: "Volume", pane: "sub", params: [5, 10, 20] },
  { name: "DELTA", label: "Volume Delta (compras − vendas agressoras)", pane: "sub", params: [] },
  { name: "CVD", label: "CVD (delta acumulado)", pane: "sub", params: [] },
  { name: "MACD", label: "MACD", pane: "sub", params: [12, 26, 9] },
  { name: "RSI", label: "RSI", pane: "sub", params: [6, 12, 24] },
  { name: "RSI_DIV", label: "RSI com divergências", pane: "sub", params: [14] },
  { name: "STOCH_RSI", label: "Estocástico RSI", pane: "sub", params: [14, 14, 3, 3] },
  { name: "KDJ", label: "KDJ (estocástico)", pane: "sub", params: [9, 3, 3] },
  { name: "ATR", label: "ATR", pane: "sub", params: [14] },
  { name: "MFI", label: "Money Flow Index (MFI)", pane: "sub", params: [14] },
  { name: "OBV", label: "On Balance Volume (OBV)", pane: "sub", params: [30] },
  { name: "DMI", label: "DMI / ADX", pane: "sub", params: [14, 6] },
  { name: "CCI", label: "CCI", pane: "sub", params: [20] },
  { name: "WR", label: "Williams %R", pane: "sub", params: [6, 10, 14] },
  { name: "MTM", label: "Momentum", pane: "sub", params: [12, 6] },
  { name: "ROC", label: "Taxa de variação (ROC)", pane: "sub", params: [12, 6] },
  { name: "TRIX", label: "TRIX", pane: "sub", params: [12, 9] },
  { name: "AO", label: "Awesome Oscillator", pane: "sub", params: [5, 34] },
  { name: "BIAS", label: "BIAS", pane: "sub", params: [6, 12, 24] },
  { name: "BRAR", label: "BRAR", pane: "sub", params: [26] },
  { name: "CR", label: "CR", pane: "sub", params: [26, 10, 20, 40, 60] },
  { name: "DMA", label: "DMA", pane: "sub", params: [10, 50, 10] },
  { name: "EMV", label: "EMV", pane: "sub", params: [14, 9] },
  { name: "PSY", label: "Psychological Line", pane: "sub", params: [12, 6] },
  { name: "PVT", label: "Price Volume Trend", pane: "sub", params: [] },
  { name: "VR", label: "Volume Ratio", pane: "sub", params: [24, 30] },
];
const INDICATOR_NAMES = new Set(CHART_INDICATORS.map((i) => i.name));

/**
 * Eixos em que o desenho inteiro pode ser arrastado (para os bloqueios X/Y da barra rápida): a linha horizontal só
 * anda na vertical e a vertical só na horizontal; os demais desenhos, nos dois.
 */
export function movableAxes(tool: string): { x: boolean; y: boolean } {
  if (tool === "horizontalStraightLine") return { x: false, y: true };
  if (tool === "verticalStraightLine") return { x: true, y: false };
  return { x: true, y: true };
}

/** Ferramentas de desenho (barra lateral): nome interno e rótulo. */
export const CHART_TOOLS: { name: string; label: string }[] = [
  { name: "segment", label: "Linha de tendência" },
  { name: "rayLine", label: "Raio" },
  { name: "straightLine", label: "Linha estendida" },
  { name: "horizontalStraightLine", label: "Linha horizontal" },
  { name: "horizontalRayLine", label: "Raio horizontal" },
  { name: "horizontalSegment", label: "Segmento horizontal" },
  { name: "verticalStraightLine", label: "Linha vertical" },
  { name: "verticalRayLine", label: "Raio vertical" },
  { name: "verticalSegment", label: "Segmento vertical" },
  { name: "priceLine", label: "Linha de preço" },
  { name: "parallelChannel", label: "Canal paralelo" },
  { name: "parallelStraightLine", label: "Linhas paralelas" },
  { name: "priceChannelLine", label: "Canal de preço" },
  { name: "parallelRays", label: "Raios paralelos" },
  { name: "elliottImpulse", label: "Elliott impulse wave (1·2·3·4·5)" },
  { name: "elliottCorrection", label: "Elliott correction wave (A·B·C)" },
  { name: "elliottTriangle", label: "Elliott triangle wave (A·B·C·D·E)" },
  { name: "elliottDoubleCombo", label: "Elliott double combo wave (W·X·Y)" },
  { name: "elliottTripleCombo", label: "Elliott triple combo wave (W·X·Y·X·Z)" },
  { name: "fibonacciLine", label: "Retração de Fibonacci" },
  { name: "rectangle", label: "Retângulo" },
  { name: "measure", label: "Medir (preço e %)" },
  { name: "fixedRangeVolumeProfile", label: "Perfil de volume (faixa fixa)" },
  { name: "anchoredVwap", label: "VWAP ancorado" },
  { name: "simpleAnnotation", label: "Anotação" },
  { name: "simpleTag", label: "Etiqueta" },
];
const TOOL_NAMES = new Set(CHART_TOOLS.map((t) => t.name));
/** Rótulos de cada ferramenta de Elliott (um por onda; o ponto de origem não tem rótulo). Os dois X do triplo são pontos diferentes. */
export const ELLIOTT_LABELS: Record<string, string[]> = {
  elliottImpulse: ["1", "2", "3", "4", "5"],
  elliottCorrection: ["A", "B", "C"],
  elliottTriangle: ["A", "B", "C", "D", "E"],
  elliottDoubleCombo: ["W", "X", "Y"],
  elliottTripleCombo: ["W", "X", "Y", "X", "Z"],
};
export const LABEL_POSITIONS = ["auto", "above", "below"] as const;
export type LabelPosition = (typeof LABEL_POSITIONS)[number];
/** Texto de um rótulo editado (curto: números, letras, parênteses, pontos e traços). */
const LABEL_TEXT = /^[\p{L}\p{N}().\- ]{0,6}$/u;
export const DEFAULT_FAVORITE_TOOLS = ["segment", "horizontalStraightLine", "fibonacciLine", "rectangle"];

export const LINE_STYLES = ["solid", "dashed", "dotted"] as const;
export type LineStyleName = (typeof LINE_STYLES)[number];
export const EXTENDS = ["none", "left", "right", "both"] as const;
export type ExtendName = (typeof EXTENDS)[number];
export const MA_TYPES = ["EMA", "SMA", "WMA", "RMA"] as const;
export type MaType = (typeof MA_TYPES)[number];
/** Preço usado no cálculo das médias. */
export const PRICE_SOURCES = ["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];
/** Representação do Volume Delta: colunas por vela ou linha. */
export const DELTA_MODES = ["columns", "line"] as const;
export type DeltaMode = (typeof DELTA_MODES)[number];
/** Escala de uma comparação sobre o preço: % (começa no mesmo ponto), faixa própria ajustada ao preço, ou o valor em US$. */
export const COMPARE_SCALES = ["percent", "fit", "price"] as const;
export type CompareScale = (typeof COMPARE_SCALES)[number];

/** Aparência de uma série de indicador (por chave da série, ex.: "e0", "macd"). */
export type SeriesStyle = { color?: string; size?: number; style?: LineStyleName; visible?: boolean };
export type IndicatorState = {
  /** Identificador da instância (copiar cria outro). */
  id?: string;
  name: string;
  params: number[];
  pane: "main" | "sub";
  /** Indicadores de painel com a mesma chave ficam no mesmo painel ("Mover para painel existente"). */
  paneKey?: string;
  visible?: boolean;
  styles?: Record<string, SeriesStyle>;
  /** O que mostrar na legenda (falso = escondido). O cálculo continua. */
  legend?: { name?: boolean; params?: boolean; values?: boolean };
  /** Opções além dos períodos (ex.: tipo de cada média do MA ribbon). */
  options?: { types?: MaType[]; levels?: number[]; source?: PriceSource; upColor?: string; downColor?: string; mode?: DeltaMode };
};
export type FibLevel = { value: number; color: string; visible: boolean };
export type OverlayStyleState = {
  color?: string;
  size?: number;
  style?: LineStyleName;
  textColor?: string;
  extend?: ExtendName;
  /** Níveis do Fibonacci. */
  levels?: FibLevel[];
  /** Perfil de volume: linhas de preço e % da área de valor. */
  rows?: number;
  valueArea?: number;
  /** Perfil de volume: cores das compras e das vendas (com transparência). */
  buyColor?: string;
  sellColor?: string;
  /** Ondas de Elliott: tamanho e textos dos rótulos, posição, e se mostram rótulos e marcadores. */
  labelSize?: number;
  showLabels?: boolean;
  showPoints?: boolean;
  labels?: string[];
  labelPosition?: LabelPosition;
  /** Perfil de volume: deslocamento horizontal da exibição, em velas (não muda a faixa analisada). */
  shiftBars?: number;
  /** Perfil de volume: espelhado na horizontal (botão "Girar"); só muda o lado das barras, não o cálculo. */
  mirror?: boolean;
  /** Perfil de volume (faixa fixa): largura visual do histograma, em % do padrão (só o desenho, não o cálculo). */
  histWidth?: number;
  /** Perfil de volume por faixa de preço: janela de tempo do cálculo (ms), guardada na inserção. */
  windowFrom?: number;
  windowTo?: number;
};
export type OverlayState = {
  id?: string;
  name: string;
  points: { timestamp: number; value: number }[];
  text?: string;
  styles?: OverlayStyleState;
  visible?: boolean;
  locked?: boolean;
  /** Arrastar o desenho inteiro não muda o tempo (X) / o preço (Y). Os pontos de controle continuam livres. */
  lockX?: boolean;
  lockY?: boolean;
};
/** Série comparada na mesma divisão: outro par da Binance (ex.: ouro PAXGUSDT) ou série macro do FRED. */
export type CompareState = ({ kind: "pair"; id: string } | { kind: "macro"; id: MacroId } | { kind: "onchain"; id: OnchainId } | { kind: "market"; id: MarketId }) & {
  display?: "main" | "sub";
  color?: string;
  size?: number;
  style?: LineStyleName;
  /** Sobre o preço: como a série entra na escala (padrão conforme o tipo). */
  scale?: CompareScale;
  visible?: boolean;
};
export type PaneState = {
  symbol: string;
  interval: ChartInterval;
  chartType: ChartType;
  scale: ChartScale;
  indicators: IndicatorState[];
  overlays: OverlayState[];
  compares: CompareState[];
  /** Legendas dos indicadores recolhidas (seta "^"). */
  legendCollapsed?: boolean;
  /** Linha Time/Open/High/Low/Close/Volume (falso = escondida). */
  showOhlc?: boolean;
  /** Botão A/N: ajuste automático da escala de preço (A = true). Padrão: N. */
  autoScale?: boolean;
  /** Botão do mapa de liquidações (camada atrás das velas). */
  liqMap?: boolean;
  /** Botão do perfil lateral de volume (faixa fixa à direita). */
  sideProfile?: boolean;
  /** Largura da faixa do perfil lateral (px), ajustada arrastando a borda esquerda dela. */
  sideWidth?: number;
  /** Cores do perfil lateral (compras e vendas, com opacidade), escolhidas clicando nas barras. Só o desenho. */
  sideColors?: { buy?: string; sell?: string };
  /** Zoom e posição salvos por par e tempo (voltam ao reabrir a aba, a página ou o mesmo par). Mais recente primeiro. */
  views?: PaneView[];
};
/** Faixa do eixo de preço (os números da biblioteca, para restaurar exatamente o enquadramento). */
export const AXIS_RANGE_KEYS = ["from", "to", "range", "realFrom", "realTo", "realRange", "displayFrom", "displayTo", "displayRange"] as const;
export type AxisRangeState = Partial<Record<(typeof AXIS_RANGE_KEYS)[number], number>>;
/**
 * Janela visível de um gráfico: vale só para o par e o tempo em que foi salva.
 * to: horário da vela-âncora (a do centro da tela), com toX = sua posição em pixels; null = acompanhando a vela mais recente.
 * y: faixa de preço, só no modo N (no modo A a escala segue as velas).
 */
export type PaneView = { symbol: string; interval: ChartInterval; barSpace: number; to: number | null; /** Posição (px) da vela "to" no gráfico, para voltar sem desvio. */ toX?: number; y?: AxisRangeState };
export type TabState = { layout: ChartLayout; panes: PaneState[] };
export type ToolPrefs = {
  visible: string[];
  favorites: string[];
  intervals: ChartInterval[];
  favoriteIndicators: string[];
  /**
   * Pares favoritos do seletor (da conta; valem para todos os gráficos). Guardados pelo identificador do instrumento —
   * o mesmo do gráfico: par da Binance (ex.: ETHBTC), par sintético (ex.: BTCETH, XLMBTC) ou série de mercado (TOTAL3).
   */
  favoriteSymbols?: string[];
  /**
   * Padrão visual de cada tipo de desenho (últimas configurações visuais confirmadas): cada desenho NOVO daquele tipo
   * nasce com ele; os já desenhados guardam as suas. Só propriedades visuais (ver OVERLAY_VISUAL_KEYS).
   */
  styleDefaults?: Record<string, OverlayStyleState>;
  /** Padrão visual de cada tipo de indicador: cor/espessura/traço das séries e cores de alta/baixa. */
  indicatorDefaults?: Record<string, IndicatorVisual>;
  /** Cores do perfil lateral (barras verdes/compras e vermelhas/vendas, com opacidade): da conta, em todos os gráficos. */
  sideColors?: { buy?: string; sell?: string };
  /** Ferramentas que já existiam quando as preferências foram salvas (as criadas depois entram visíveis). */
  known?: string[];
  /** Modelo para gráficos novos: a configuração do gráfico de referência (1º gráfico da aba indicada). */
  template?: PaneTemplate;
};

/**
 * Configuração que um gráfico novo herda (só configurações; os cálculos são de cada ativo).
 * Não entram: par, tempo, desenhos, comparações, zoom e posição.
 */
export type PaneTemplate = {
  /** Aba de onde o modelo vem (seu 1º gráfico); se ela for fechada, o último modelo continua valendo. */
  sourceTabId?: number;
  /** Qual divisão dessa aba (0 = a primeira). */
  sourcePane?: number;
  indicators: IndicatorState[];
  chartType: ChartType;
  scale: ChartScale;
  legendCollapsed?: boolean;
  showOhlc?: boolean;
  autoScale?: boolean;
};

/** Modelo a partir de um gráfico (cópia: nada é compartilhado por referência). */
export function templateOf(p: PaneState, sourceTabId?: number, sourcePane?: number): PaneTemplate {
  return {
    ...(sourceTabId === undefined ? {} : { sourceTabId }),
    ...(sourcePane ? { sourcePane } : {}),
    indicators: structuredClone(p.indicators),
    chartType: p.chartType,
    scale: p.scale,
    ...(p.legendCollapsed === undefined ? {} : { legendCollapsed: p.legendCollapsed }),
    ...(p.showOhlc === undefined ? {} : { showOhlc: p.showOhlc }),
    ...(p.autoScale === undefined ? {} : { autoScale: p.autoScale }),
  };
}

/** Gráfico novo seguindo o modelo: indicadores com ids novos (painéis compartilhados continuam juntos). */
export function paneFromTemplate(symbol: string, t: PaneTemplate | undefined, newId: () => string): PaneState {
  const base = defaultPane(symbol);
  if (!t) return base;
  const ids = new Map<string, string>();
  const idFor = (old: string) => ids.get(old) ?? (ids.set(old, newId()), ids.get(old)!);
  const indicators = t.indicators.map((i) => {
    const copy = structuredClone(i);
    copy.id = i.id ? idFor(i.id) : newId();
    if (i.paneKey) copy.paneKey = idFor(i.paneKey);
    return copy;
  });
  return {
    ...base,
    indicators,
    chartType: t.chartType,
    scale: t.scale,
    ...(t.legendCollapsed === undefined ? {} : { legendCollapsed: t.legendCollapsed }),
    ...(t.showOhlc === undefined ? {} : { showOhlc: t.showOhlc }),
    ...(t.autoScale === undefined ? {} : { autoScale: t.autoScale }),
  };
}
/** Ferramentas da primeira versão (preferências salvas sem "known"). */
const KNOWN_V1 = [
  "segment",
  "rayLine",
  "straightLine",
  "horizontalStraightLine",
  "horizontalRayLine",
  "horizontalSegment",
  "verticalStraightLine",
  "verticalRayLine",
  "verticalSegment",
  "priceLine",
  "parallelStraightLine",
  "priceChannelLine",
  "fibonacciLine",
  "rectangle",
  "measure",
  "simpleAnnotation",
  "simpleTag",
];
/** Tempos que aparecem na barra superior (no máximo 8). */
export const MAX_BAR_INTERVALS = 8;
export const DEFAULT_INTERVALS: ChartInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"];

export const defaultPane = (symbol = "BTCUSDT"): PaneState => ({
  symbol,
  interval: "1d",
  chartType: "candle",
  scale: "normal",
  indicators: [{ name: "VOL", params: [5, 10, 20], pane: "sub" }],
  overlays: [],
  compares: [],
});
export const defaultTab = (): TabState => ({ layout: 1, panes: [defaultPane()] });
export const defaultPrefs = (): ToolPrefs => ({
  visible: CHART_TOOLS.map((t) => t.name),
  favorites: [...DEFAULT_FAVORITE_TOOLS],
  intervals: [...DEFAULT_INTERVALS],
  favoriteIndicators: [],
  favoriteSymbols: [],
  known: CHART_TOOLS.map((t) => t.name),
});

/** Limites da largura do histograma da Faixa Fixa (% do padrão). */
export const HIST_WIDTH_MIN = 25;
export const HIST_WIDTH_MAX = 300;

/** Limites da largura do perfil lateral (px). */
export const SIDE_WIDTH_MIN = 60;
export const SIDE_WIDTH_MAX = 600;

/**
 * Propriedades VISUAIS de um desenho (aba Estilo): entram no padrão do tipo e o botão "Padrão" as restaura.
 * Fora daqui ficam posição, pontos, janela analisada, deslocamento, espelhamento e textos dos rótulos.
 */
export const OVERLAY_VISUAL_KEYS = ["color", "size", "style", "textColor", "buyColor", "sellColor", "histWidth", "labelSize", "showLabels", "showPoints", "labelPosition", "levels"] as const;
type VisualKey = (typeof OVERLAY_VISUAL_KEYS)[number];

/** Só as propriedades visuais definidas de um estilo de desenho. */
export function visualStyles(st: OverlayStyleState | undefined): OverlayStyleState {
  const out: OverlayStyleState = {};
  if (!st) return out;
  for (const k of OVERLAY_VISUAL_KEYS) if (st[k] !== undefined) (out as Record<VisualKey, unknown>)[k] = st[k];
  return out;
}

/** Padrão de fábrica de um estilo: tira as propriedades visuais (níveis do Fibonacci: só as cores voltam às originais). */
export function factoryVisualStyles(st: OverlayStyleState, defaultLevels: FibLevel[]): OverlayStyleState {
  const out: OverlayStyleState = { ...st };
  for (const k of OVERLAY_VISUAL_KEYS) if (k !== "levels") (out as Record<VisualKey, unknown>)[k] = undefined;
  if (st.levels) out.levels = st.levels.map((l) => ({ ...l, color: defaultLevels.find((d) => d.value === l.value)?.color ?? l.color }));
  return out;
}

/** Visual de um indicador: cor/espessura/traço de cada série e cores de alta/baixa (períodos e opções de cálculo, não). */
export type IndicatorVisual = { styles?: Record<string, { color?: string; size?: number; style?: LineStyleName }>; upColor?: string; downColor?: string };

export function indicatorVisual(ind: Pick<IndicatorState, "styles" | "options">): IndicatorVisual {
  const styles: Record<string, { color?: string; size?: number; style?: LineStyleName }> = {};
  for (const [k, v] of Object.entries(ind.styles ?? {})) {
    const line = { ...(v.color ? { color: v.color } : {}), ...(v.size ? { size: v.size } : {}), ...(v.style ? { style: v.style } : {}) };
    if (Object.keys(line).length) styles[k] = line;
  }
  return {
    ...(Object.keys(styles).length ? { styles } : {}),
    ...(ind.options?.upColor ? { upColor: ind.options.upColor } : {}),
    ...(ind.options?.downColor ? { downColor: ind.options.downColor } : {}),
  };
}

/** Indicador novo com o padrão visual do tipo (as séries guardam a própria visibilidade). */
export function withIndicatorVisual(ind: IndicatorState, v: IndicatorVisual | undefined): IndicatorState {
  if (!v || (!v.styles && !v.upColor && !v.downColor)) return ind;
  return {
    ...ind,
    ...(v.styles ? { styles: Object.fromEntries(Object.entries(v.styles).map(([k, line]) => [k, { ...line, ...(ind.styles?.[k]?.visible === undefined ? {} : { visible: ind.styles[k].visible }) }])) } : {}),
    ...(v.upColor || v.downColor ? { options: { ...ind.options, ...(v.upColor ? { upColor: v.upColor } : {}), ...(v.downColor ? { downColor: v.downColor } : {}) } } : {}),
  };
}

/** Padrão de fábrica do visual de um indicador: tira cores/espessuras/traços (mantém visibilidade, períodos e opções). */
export function factoryIndicatorVisual(ind: IndicatorState): IndicatorState {
  const styles = Object.fromEntries(Object.entries(ind.styles ?? {}).flatMap(([k, v]) => (v.visible === undefined ? [] : [[k, { visible: v.visible }]])));
  const options = { ...ind.options };
  delete options.upColor;
  delete options.downColor;
  const out: IndicatorState = { ...ind };
  if (Object.keys(styles).length) out.styles = styles;
  else delete out.styles;
  if (Object.keys(options).length) out.options = options;
  else delete out.options;
  return out;
}

function sanitizeStyleDefaults(v: unknown, legacyProfileColors: unknown): Record<string, OverlayStyleState> | undefined {
  const out: Record<string, OverlayStyleState> = {};
  if (isObj(v))
    for (const [tool, raw] of Object.entries(v).slice(0, 80)) {
      if (!TOOL_NAMES.has(tool)) continue;
      const st = sanitizeOverlayStyles(raw);
      const vis = st ? visualStyles(st) : {};
      if (Object.keys(vis).length) out[tool] = vis;
    }
  // Preferência antiga (só a Faixa Fixa guardava as últimas cores): vira o padrão dela.
  if (!out.fixedRangeVolumeProfile && isObj(legacyProfileColors)) {
    const old: OverlayStyleState = {};
    for (const k of ["color", "buyColor", "sellColor"] as const) if (typeof legacyProfileColors[k] === "string" && COLOR.test(legacyProfileColors[k] as string)) old[k] = legacyProfileColors[k] as string;
    if (Object.keys(old).length) out.fixedRangeVolumeProfile = old;
  }
  return Object.keys(out).length ? out : undefined;
}

function sanitizeIndicatorDefaults(v: unknown): Record<string, IndicatorVisual> | undefined {
  if (!isObj(v)) return undefined;
  const out: Record<string, IndicatorVisual> = {};
  for (const [name, raw] of Object.entries(v).slice(0, 80)) {
    if (!INDICATOR_NAMES.has(name) || !isObj(raw)) continue;
    const item: IndicatorVisual = {};
    if (isObj(raw.styles)) {
      const styles: NonNullable<IndicatorVisual["styles"]> = {};
      for (const [key, line] of Object.entries(raw.styles).slice(0, 20)) {
        if (!SERIES_KEY.test(key) || !isObj(line)) continue;
        const ok = sanitizeLine(line);
        if (ok && Object.keys(ok).length) styles[key] = ok;
      }
      if (Object.keys(styles).length) item.styles = styles;
    }
    for (const k of ["upColor", "downColor"] as const) if (typeof raw[k] === "string" && COLOR.test(raw[k] as string)) item[k] = raw[k] as string;
    if (Object.keys(item).length) out[name] = item;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Máximo de pares favoritos. */
export const MAX_FAVORITE_SYMBOLS = 200;
/** Identificador de instrumento válido (mesma regra do par de um gráfico). */
export const isInstrumentId = (s: unknown): s is string => typeof s === "string" && (isMarketId(s) || (/^[A-Z0-9]{2,20}$/.test(s) && !!splitSymbol(s)));

type R<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
// Sem caracteres de controle nem invisíveis/de direção.
const SAFE_TEXT = /^[^\p{Cc}\p{Cf}]*$/u;
const COLOR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const SERIES_KEY = /^[a-zA-Z][a-zA-Z0-9]{0,19}$/;
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => (list as readonly unknown[]).includes(v);

/** Cor/espessura/traço comuns a séries e desenhos; null = inválido. */
function sanitizeLine(v: Record<string, unknown>): { color?: string; size?: number; style?: LineStyleName } | null {
  const out: { color?: string; size?: number; style?: LineStyleName } = {};
  if (v.color !== undefined) {
    if (typeof v.color !== "string" || !COLOR.test(v.color)) return null;
    out.color = v.color;
  }
  if (v.size !== undefined) {
    if (!isNum(v.size) || v.size < 0.5 || v.size > 10) return null;
    out.size = v.size;
  }
  if (v.style !== undefined) {
    if (!oneOf(LINE_STYLES, v.style)) return null;
    out.style = v.style;
  }
  return out;
}

function sanitizeIndicatorExtras(v: Record<string, unknown>, out: IndicatorState): string | null {
  if (v.id !== undefined) {
    if (typeof v.id !== "string" || !ID.test(v.id)) return "Indicador inválido";
    out.id = v.id;
  }
  if (v.paneKey !== undefined) {
    if (typeof v.paneKey !== "string" || !ID.test(v.paneKey)) return "Painel do indicador inválido";
    out.paneKey = v.paneKey;
  }
  if (v.visible !== undefined) {
    if (!isBool(v.visible)) return "Indicador inválido";
    out.visible = v.visible;
  }
  if (v.styles !== undefined) {
    if (!isObj(v.styles) || Object.keys(v.styles).length > 20) return "Estilo do indicador inválido";
    const styles: Record<string, SeriesStyle> = {};
    for (const [key, raw] of Object.entries(v.styles)) {
      if (!SERIES_KEY.test(key) || !isObj(raw)) return "Estilo do indicador inválido";
      const line = sanitizeLine(raw);
      if (!line || (raw.visible !== undefined && !isBool(raw.visible))) return "Estilo do indicador inválido";
      styles[key] = { ...line, ...(raw.visible === undefined ? {} : { visible: raw.visible as boolean }) };
    }
    out.styles = styles;
  }
  if (v.legend !== undefined) {
    if (!isObj(v.legend)) return "Legenda do indicador inválida";
    const legend: NonNullable<IndicatorState["legend"]> = {};
    for (const k of ["name", "params", "values"] as const) {
      if (v.legend[k] === undefined) continue;
      if (!isBool(v.legend[k])) return "Legenda do indicador inválida";
      legend[k] = v.legend[k] as boolean;
    }
    out.legend = legend;
  }
  if (v.options !== undefined) {
    if (!isObj(v.options)) return "Opções do indicador inválidas";
    const t = v.options.types;
    if (t !== undefined && (!Array.isArray(t) || t.length > LIMITS.paramsPerIndicator || !t.every((x) => oneOf(MA_TYPES, x)))) return "Opções do indicador inválidas";
    // Níveis de referência (ex.: RSI 30/50/70): de 0 a 100, no máximo 5.
    const lv = v.options.levels;
    if (lv !== undefined && (!Array.isArray(lv) || lv.length > 5 || !lv.every((x) => isNum(x) && x >= 0 && x <= 100))) return "Opções do indicador inválidas";
    const { source, upColor, downColor, mode } = v.options;
    if (source !== undefined && !oneOf(PRICE_SOURCES, source)) return "Opções do indicador inválidas";
    if (mode !== undefined && !oneOf(DELTA_MODES, mode)) return "Opções do indicador inválidas";
    for (const c of [upColor, downColor]) if (c !== undefined && (typeof c !== "string" || !COLOR.test(c))) return "Opções do indicador inválidas";
    out.options = {
      ...(t === undefined ? {} : { types: t as MaType[] }),
      ...(lv === undefined ? {} : { levels: lv as number[] }),
      ...(source === undefined ? {} : { source: source as PriceSource }),
      ...(upColor === undefined ? {} : { upColor: upColor as string }),
      ...(downColor === undefined ? {} : { downColor: downColor as string }),
      ...(mode === undefined ? {} : { mode: mode as DeltaMode }),
    };
  }
  return null;
}

function sanitizeOverlayStyles(v: unknown): OverlayStyleState | null {
  if (!isObj(v)) return null;
  const line = sanitizeLine(v);
  if (!line) return null;
  const out: OverlayStyleState = { ...line };
  if (v.textColor !== undefined) {
    if (typeof v.textColor !== "string" || !COLOR.test(v.textColor)) return null;
    out.textColor = v.textColor;
  }
  if (v.extend !== undefined) {
    if (!oneOf(EXTENDS, v.extend)) return null;
    out.extend = v.extend;
  }
  if (v.levels !== undefined) {
    if (!Array.isArray(v.levels) || v.levels.length > 24) return null;
    const levels: FibLevel[] = [];
    for (const l of v.levels) {
      if (!isObj(l) || !isNum(l.value) || Math.abs(l.value) > 100 || typeof l.color !== "string" || !COLOR.test(l.color) || !isBool(l.visible)) return null;
      levels.push({ value: l.value, color: l.color, visible: l.visible });
    }
    out.levels = levels;
  }
  if (v.rows !== undefined) {
    if (!Number.isInteger(v.rows) || (v.rows as number) < 4 || (v.rows as number) > 200) return null;
    out.rows = v.rows as number;
  }
  if (v.valueArea !== undefined) {
    if (!isNum(v.valueArea) || v.valueArea < 10 || v.valueArea > 100) return null;
    out.valueArea = v.valueArea;
  }
  for (const k of ["buyColor", "sellColor"] as const) {
    if (v[k] === undefined) continue;
    if (typeof v[k] !== "string" || !COLOR.test(v[k] as string)) return null;
    out[k] = v[k] as string;
  }
  if (v.labelSize !== undefined) {
    if (!Number.isInteger(v.labelSize) || (v.labelSize as number) < 8 || (v.labelSize as number) > 28) return null;
    out.labelSize = v.labelSize as number;
  }
  for (const k of ["showLabels", "showPoints"] as const) {
    if (v[k] === undefined) continue;
    if (!isBool(v[k])) return null;
    out[k] = v[k] as boolean;
  }
  if (v.labels !== undefined) {
    if (!Array.isArray(v.labels) || v.labels.length > 5 || !v.labels.every((t) => typeof t === "string" && LABEL_TEXT.test(t))) return null;
    out.labels = v.labels as string[];
  }
  if (v.shiftBars !== undefined) {
    if (!Number.isInteger(v.shiftBars) || Math.abs(v.shiftBars as number) > 5000) return null;
    out.shiftBars = v.shiftBars as number;
  }
  if (v.mirror !== undefined) {
    if (typeof v.mirror !== "boolean") return null;
    out.mirror = v.mirror;
  }
  if (v.histWidth !== undefined) {
    if (!Number.isInteger(v.histWidth) || (v.histWidth as number) < HIST_WIDTH_MIN || (v.histWidth as number) > HIST_WIDTH_MAX) return null;
    out.histWidth = v.histWidth as number;
  }
  if (v.windowFrom !== undefined || v.windowTo !== undefined) {
    const a = v.windowFrom;
    const b = v.windowTo;
    if (!isNum(a) || !isNum(b) || a > b || a < 0 || b > 4_102_444_800_000) return null;
    out.windowFrom = a;
    out.windowTo = b;
  }
  if (v.labelPosition !== undefined) {
    if (!oneOf(LABEL_POSITIONS, v.labelPosition)) return null;
    out.labelPosition = v.labelPosition;
  }
  return out;
}

function sanitizeIndicator(v: unknown): R<IndicatorState> {
  if (!isObj(v) || typeof v.name !== "string" || !INDICATOR_NAMES.has(v.name)) return fail("Indicador inválido");
  if (!Array.isArray(v.params) || v.params.length > LIMITS.paramsPerIndicator || !v.params.every((p) => isNum(p) && p > 0 && p <= 10_000)) {
    return fail("Parâmetros do indicador inválidos");
  }
  if (v.pane !== "main" && v.pane !== "sub") return fail("Painel do indicador inválido");
  const out: IndicatorState = { name: v.name, params: v.params as number[], pane: v.pane };
  const err = sanitizeIndicatorExtras(v, out);
  return err ? fail(err) : { ok: true, value: out };
}

function sanitizeOverlay(v: unknown): R<OverlayState> {
  if (!isObj(v) || typeof v.name !== "string" || !TOOL_NAMES.has(v.name)) return fail("Desenho inválido");
  if (!Array.isArray(v.points) || v.points.length > LIMITS.pointsPerOverlay) return fail("Pontos do desenho inválidos");
  const points: { timestamp: number; value: number }[] = [];
  for (const p of v.points) {
    if (!isObj(p) || !isNum(p.timestamp) || !isNum(p.value)) return fail("Pontos do desenho inválidos");
    points.push({ timestamp: p.timestamp, value: p.value });
  }
  const out: OverlayState = { name: v.name, points };
  if (v.text !== undefined) {
    if (typeof v.text !== "string" || v.text.length > LIMITS.overlayText || !SAFE_TEXT.test(v.text)) return fail("Texto do desenho inválido");
    out.text = v.text;
  }
  if (v.id !== undefined) {
    if (typeof v.id !== "string" || !ID.test(v.id)) return fail("Desenho inválido");
    out.id = v.id;
  }
  for (const k of ["visible", "locked", "lockX", "lockY"] as const) {
    if (v[k] === undefined) continue;
    if (!isBool(v[k])) return fail("Desenho inválido");
    out[k] = v[k] as boolean;
  }
  if (v.styles !== undefined) {
    const st = sanitizeOverlayStyles(v.styles);
    if (!st) return fail("Estilo do desenho inválido");
    out.styles = st;
  }
  return { ok: true, value: out };
}

function sanitizeCompare(v: unknown): R<CompareState> {
  if (!isObj(v)) return fail("Comparação inválida");
  if (v.display !== undefined && v.display !== "main" && v.display !== "sub") return fail("Comparação inválida");
  const line = sanitizeLine({ color: v.color, size: v.size, style: v.style });
  if (!line || (v.visible !== undefined && !isBool(v.visible))) return fail("Comparação inválida");
  if (v.scale !== undefined && !oneOf(COMPARE_SCALES, v.scale)) return fail("Comparação inválida");
  const extra = {
    ...(v.display === undefined ? {} : { display: v.display as "main" | "sub" }),
    ...(v.scale === undefined ? {} : { scale: v.scale as CompareScale }),
    ...line,
    ...(v.visible === undefined ? {} : { visible: v.visible as boolean }),
  };
  if (v.kind === "pair" && typeof v.id === "string" && /^[A-Z0-9]{2,20}$/.test(v.id) && splitSymbol(v.id)) return { ok: true, value: { kind: "pair", id: v.id, ...extra } };
  if (v.kind === "macro" && (MACRO_IDS as readonly unknown[]).includes(v.id)) return { ok: true, value: { kind: "macro", id: v.id as MacroId, ...extra } };
  if (v.kind === "onchain" && (ONCHAIN_IDS as readonly unknown[]).includes(v.id)) return { ok: true, value: { kind: "onchain", id: v.id as OnchainId, ...extra } };
  if (v.kind === "market" && (MARKET_IDS as readonly unknown[]).includes(v.id)) return { ok: true, value: { kind: "market", id: v.id as MarketId, ...extra } };
  return fail("Comparação inválida");
}

function sanitizePane(v: unknown): R<PaneState> {
  if (!isObj(v)) return fail("Gráfico inválido");
  const symbol = typeof v.symbol === "string" ? v.symbol : "";
  // Par da Binance (ou um par invertido: BTCETH, USDTBTC) ou um instrumento de mercado da lista fechada (TOTAL3, BTC.D...).
  if (!isMarketId(symbol) && (!/^[A-Z0-9]{2,20}$/.test(symbol) || !splitSymbol(symbol))) return fail("Par inválido");
  if (!(CHART_INTERVALS as readonly unknown[]).includes(v.interval)) return fail("Tempo inválido");
  if (!(CHART_TYPES as readonly unknown[]).includes(v.chartType)) return fail("Tipo de gráfico inválido");
  if (!(CHART_SCALES as readonly unknown[]).includes(v.scale)) return fail("Escala inválida");
  const rawInd = v.indicators ?? [];
  const rawOv = v.overlays ?? [];
  if (!Array.isArray(rawInd) || rawInd.length > LIMITS.indicatorsPerPane) return fail(`Até ${LIMITS.indicatorsPerPane} indicadores por gráfico`);
  if (!Array.isArray(rawOv) || rawOv.length > LIMITS.overlaysPerPane) return fail(`Até ${LIMITS.overlaysPerPane} desenhos por gráfico`);
  const indicators: IndicatorState[] = [];
  for (const i of rawInd) {
    const r = sanitizeIndicator(i);
    if (!r.ok) return r;
    indicators.push(r.value);
  }
  const overlays: OverlayState[] = [];
  for (const o of rawOv) {
    const r = sanitizeOverlay(o);
    if (!r.ok) return r;
    overlays.push(r.value);
  }
  const rawCmp = v.compares ?? [];
  if (!Array.isArray(rawCmp) || rawCmp.length > LIMITS.comparesPerPane) return fail(`Até ${LIMITS.comparesPerPane} comparações por gráfico`);
  const compares: CompareState[] = [];
  for (const c of rawCmp) {
    const r = sanitizeCompare(c);
    if (!r.ok) return r;
    compares.push(r.value);
  }
  for (const k of ["legendCollapsed", "showOhlc", "autoScale", "liqMap", "sideProfile"] as const) if (v[k] !== undefined && !isBool(v[k])) return fail("Gráfico inválido");
  if (v.sideWidth !== undefined && !(typeof v.sideWidth === "number" && Number.isInteger(v.sideWidth) && v.sideWidth >= SIDE_WIDTH_MIN && v.sideWidth <= SIDE_WIDTH_MAX)) return fail("Gráfico inválido");
  let sideColors: { buy?: string; sell?: string } | undefined;
  if (v.sideColors !== undefined) {
    const sc = v.sideColors;
    if (!isObj(sc) || Object.keys(sc).some((k) => k !== "buy" && k !== "sell")) return fail("Gráfico inválido");
    for (const k of ["buy", "sell"] as const) if (sc[k] !== undefined && !(typeof sc[k] === "string" && COLOR.test(sc[k] as string))) return fail("Gráfico inválido");
    sideColors = { ...(sc.buy === undefined ? {} : { buy: sc.buy as string }), ...(sc.sell === undefined ? {} : { sell: sc.sell as string }) };
  }
  // Zoom salvo inválido não derruba o gráfico: só é descartado.
  const views = Array.isArray(v.views) ? v.views.slice(0, MAX_VIEWS).map(sanitizeView).filter((x): x is PaneView => !!x) : [];
  return {
    ok: true,
    value: {
      symbol,
      interval: v.interval as ChartInterval,
      chartType: v.chartType as ChartType,
      scale: v.scale as ChartScale,
      indicators,
      overlays,
      compares,
      ...(v.legendCollapsed === undefined ? {} : { legendCollapsed: v.legendCollapsed as boolean }),
      ...(v.showOhlc === undefined ? {} : { showOhlc: v.showOhlc as boolean }),
      ...(v.autoScale === undefined ? {} : { autoScale: v.autoScale as boolean }),
      ...(v.liqMap === undefined ? {} : { liqMap: v.liqMap as boolean }),
      ...(v.sideProfile === undefined ? {} : { sideProfile: v.sideProfile as boolean }),
      ...(v.sideWidth === undefined ? {} : { sideWidth: v.sideWidth as number }),
      ...(sideColors ? { sideColors } : {}),
      ...(views.length ? { views } : {}),
    },
  };
}

export const MAX_VIEWS = 8;

/** Guarda a janela do par/tempo (substitui a anterior do mesmo par/tempo; mais recente primeiro). */
export function withView(views: PaneView[] | undefined, v: PaneView): PaneView[] {
  return [v, ...(views ?? []).filter((x) => x.symbol !== v.symbol || x.interval !== v.interval)].slice(0, MAX_VIEWS);
}

/** Zoom/posição salvos: números finitos e dentro de limites; senão, descarta (o gráfico abre no padrão). */
export function sanitizeView(v: unknown): PaneView | undefined {
  if (!isObj(v)) return undefined;
  if (typeof v.symbol !== "string" || v.symbol.length > 20 || !(CHART_INTERVALS as readonly unknown[]).includes(v.interval)) return undefined;
  const barSpace = v.barSpace;
  if (typeof barSpace !== "number" || !Number.isFinite(barSpace) || barSpace < 0.5 || barSpace > 200) return undefined;
  const to = v.to;
  if (to !== null && (typeof to !== "number" || !Number.isInteger(to) || to < 0 || to > 4_102_444_800_000)) return undefined;
  const toX = typeof v.toX === "number" && Number.isFinite(v.toX) && Math.abs(v.toX) <= 20_000 ? v.toX : undefined;
  let y: AxisRangeState | undefined;
  if (isObj(v.y)) {
    const out: AxisRangeState = {};
    for (const k of AXIS_RANGE_KEYS) {
      const n = v.y[k];
      if (n === undefined) continue;
      if (typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 1e15) return { symbol: v.symbol, interval: v.interval as ChartInterval, barSpace, to, ...(toX === undefined ? {} : { toX }) };
      out[k] = n;
    }
    if (typeof out.from === "number" && typeof out.to === "number" && out.to > out.from) y = out;
  }
  return { symbol: v.symbol, interval: v.interval as ChartInterval, barSpace, to, ...(toX === undefined ? {} : { toX }), ...(y ? { y } : {}) };
}

/** Valida o estado de uma aba; completa com gráficos padrão até o número do layout (e corta os que sobrarem). */
export function sanitizeTabState(v: unknown): R<TabState> {
  if (!isObj(v)) return fail("Dados inválidos");
  if (!(CHART_LAYOUTS as readonly unknown[]).includes(v.layout)) return fail("Layout inválido");
  const layout = v.layout as ChartLayout;
  if (!Array.isArray(v.panes) || v.panes.length > 8) return fail("Gráficos inválidos");
  const panes: PaneState[] = [];
  for (const p of v.panes.slice(0, layout)) {
    const r = sanitizePane(p);
    if (!r.ok) return r;
    panes.push(r.value);
  }
  while (panes.length < layout) panes.push(defaultPane());
  const value = { layout, panes };
  if (JSON.stringify(value).length > LIMITS.stateBytes) return fail("Aba grande demais: apague alguns desenhos");
  return { ok: true, value };
}

/** Valida as preferências das ferramentas: só conhecidas, sem repetição; favoritas ficam visíveis. */
export function sanitizePrefs(v: unknown): R<ToolPrefs> {
  if (!isObj(v) || !Array.isArray(v.visible) || !Array.isArray(v.favorites)) return fail("Preferências inválidas");
  const pick = (list: unknown[]) => [...new Set(list.filter((t): t is string => typeof t === "string" && TOOL_NAMES.has(t)))];
  const favorites = pick(v.favorites);
  const known = Array.isArray(v.known) ? pick(v.known) : KNOWN_V1;
  const added = CHART_TOOLS.map((t) => t.name).filter((n) => !known.includes(n));
  const visible = [...new Set([...pick(v.visible), ...favorites, ...added])];
  // Tempos: só conhecidos, sem repetição, do menor para o maior, no máximo 8.
  const rawIntervals = Array.isArray(v.intervals) ? v.intervals : [];
  const intervals = CHART_INTERVALS.filter((i) => rawIntervals.includes(i)).slice(0, MAX_BAR_INTERVALS);
  const rawFav = Array.isArray(v.favoriteIndicators) ? v.favoriteIndicators : [];
  const favoriteIndicators = [...new Set(rawFav.filter((n): n is string => typeof n === "string" && INDICATOR_NAMES.has(n)))];
  // Pares favoritos: só identificadores válidos, sem repetição, até o limite.
  const favoriteSymbols = [...new Set((Array.isArray(v.favoriteSymbols) ? v.favoriteSymbols : []).filter(isInstrumentId))].slice(0, MAX_FAVORITE_SYMBOLS);
  const styleDefaults = sanitizeStyleDefaults(v.styleDefaults, v.profileColors);
  const indicatorDefaults = sanitizeIndicatorDefaults(v.indicatorDefaults);
  const sideColors = isObj(v.sideColors)
    ? Object.fromEntries((["buy", "sell"] as const).flatMap((k) => (typeof (v.sideColors as Record<string, unknown>)[k] === "string" && COLOR.test((v.sideColors as Record<string, string>)[k]) ? [[k, (v.sideColors as Record<string, string>)[k]]] : [])))
    : {};
  // Modelo para gráficos novos: validado como um gráfico; inválido ou grande demais é descartado (o resto salva).
  const template = sanitizeTemplate(v.template);
  return {
    ok: true,
    value: {
      visible,
      favorites,
      intervals: intervals.length ? intervals : [...DEFAULT_INTERVALS],
      favoriteIndicators,
      favoriteSymbols,
      ...(styleDefaults ? { styleDefaults } : {}),
      ...(indicatorDefaults ? { indicatorDefaults } : {}),
      ...(Object.keys(sideColors).length ? { sideColors: sideColors as { buy?: string; sell?: string } } : {}),
      known: CHART_TOOLS.map((t) => t.name),
      ...(template ? { template } : {}),
    },
  };
}

function sanitizeTemplate(v: unknown): PaneTemplate | undefined {
  if (!isObj(v) || JSON.stringify(v).length > 60_000) return undefined;
  if (!(CHART_TYPES as readonly unknown[]).includes(v.chartType) || !(CHART_SCALES as readonly unknown[]).includes(v.scale)) return undefined;
  if (!Array.isArray(v.indicators) || v.indicators.length > LIMITS.indicatorsPerPane) return undefined;
  const indicators: IndicatorState[] = [];
  for (const i of v.indicators) {
    const r = sanitizeIndicator(i);
    if (!r.ok) return undefined;
    indicators.push(r.value);
  }
  if (v.sourceTabId !== undefined && !(Number.isInteger(v.sourceTabId) && (v.sourceTabId as number) > 0)) return undefined;
  if (v.sourcePane !== undefined && !(Number.isInteger(v.sourcePane) && (v.sourcePane as number) >= 0 && (v.sourcePane as number) < 8)) return undefined;
  for (const k of ["legendCollapsed", "showOhlc", "autoScale"] as const) if (v[k] !== undefined && !isBool(v[k])) return undefined;
  return {
    ...(v.sourceTabId === undefined ? {} : { sourceTabId: v.sourceTabId as number }),
    ...(v.sourcePane === undefined ? {} : { sourcePane: v.sourcePane as number }),
    indicators,
    chartType: v.chartType as ChartType,
    scale: v.scale as ChartScale,
    ...(v.legendCollapsed === undefined ? {} : { legendCollapsed: v.legendCollapsed as boolean }),
    ...(v.showOhlc === undefined ? {} : { showOhlc: v.showOhlc as boolean }),
    ...(v.autoScale === undefined ? {} : { autoScale: v.autoScale as boolean }),
  };
}
