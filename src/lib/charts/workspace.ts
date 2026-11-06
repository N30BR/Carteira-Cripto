// Estado das abas da aba Gráficos (o que é salvo na conta) e a validação de tudo que vem do navegador.
// Sem dependências de banco ou navegador: usado no servidor (actions) e no cliente (tela).
import { MACRO_IDS, type MacroId } from "./macro-ids";
import { CHART_INTERVALS, splitSymbol, type ChartInterval } from "./params";

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
  { name: "BOLL", label: "Bandas de Bollinger", pane: "main", params: [20, 2] },
  { name: "VWAP", label: "VWAP", pane: "main", params: [] },
  { name: "SAR", label: "Parabolic SAR", pane: "main", params: [2, 2, 20] },
  { name: "BBI", label: "BBI", pane: "main", params: [3, 6, 12, 24] },
  { name: "ICHIMOKU", label: "Ichimoku", pane: "main", params: [9, 26, 52] },
  { name: "VOLUME_PROFILE", label: "Volume Profile (faixa visível)", pane: "main", params: [24, 70] },
  { name: "AVP", label: "Preço médio (AVP)", pane: "main", params: [] },
  { name: "LIQ_HEATMAP", label: "Heatmap de liquidações (estimado)", pane: "main", params: [] },
  // Em painel próprio
  { name: "VOL", label: "Volume", pane: "sub", params: [5, 10, 20] },
  { name: "DELTA", label: "Delta (compras − vendas agressoras)", pane: "sub", params: [] },
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
  { name: "fibonacciLine", label: "Retração de Fibonacci" },
  { name: "rectangle", label: "Retângulo" },
  { name: "measure", label: "Medir (preço e %)" },
  { name: "fixedRangeVolumeProfile", label: "Perfil de volume (faixa fixa)" },
  { name: "anchoredVwap", label: "VWAP ancorado" },
  { name: "simpleAnnotation", label: "Anotação" },
  { name: "simpleTag", label: "Etiqueta" },
];
const TOOL_NAMES = new Set(CHART_TOOLS.map((t) => t.name));
export const DEFAULT_FAVORITE_TOOLS = ["segment", "horizontalStraightLine", "fibonacciLine", "rectangle"];

export const LINE_STYLES = ["solid", "dashed", "dotted"] as const;
export type LineStyleName = (typeof LINE_STYLES)[number];
export const EXTENDS = ["none", "left", "right", "both"] as const;
export type ExtendName = (typeof EXTENDS)[number];
export const MA_TYPES = ["EMA", "SMA"] as const;
export type MaType = (typeof MA_TYPES)[number];

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
  options?: { types?: MaType[]; levels?: number[] };
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
};
export type OverlayState = {
  id?: string;
  name: string;
  points: { timestamp: number; value: number }[];
  text?: string;
  styles?: OverlayStyleState;
  visible?: boolean;
  locked?: boolean;
};
/** Série comparada na mesma divisão: outro par da Binance (ex.: ouro PAXGUSDT) ou série macro do FRED. */
export type CompareState = ({ kind: "pair"; id: string } | { kind: "macro"; id: MacroId }) & { display?: "main" | "sub" };
export type PaneState = {
  symbol: string;
  interval: ChartInterval;
  chartType: ChartType;
  scale: ChartScale;
  indicators: IndicatorState[];
  overlays: OverlayState[];
  compares: CompareState[];
};
export type TabState = { layout: ChartLayout; panes: PaneState[] };
export type ToolPrefs = {
  visible: string[];
  favorites: string[];
  intervals: ChartInterval[];
  favoriteIndicators: string[];
  /** Ferramentas que já existiam quando as preferências foram salvas (as criadas depois entram visíveis). */
  known?: string[];
};
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
  known: CHART_TOOLS.map((t) => t.name),
});

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
    out.options = { ...(t === undefined ? {} : { types: t as MaType[] }), ...(lv === undefined ? {} : { levels: lv as number[] }) };
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
  for (const k of ["visible", "locked"] as const) {
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
  const display = v.display === undefined ? {} : { display: v.display as "main" | "sub" };
  if (v.kind === "pair" && typeof v.id === "string" && /^[A-Z0-9]{2,20}$/.test(v.id) && splitSymbol(v.id)) return { ok: true, value: { kind: "pair", id: v.id, ...display } };
  if (v.kind === "macro" && (MACRO_IDS as readonly unknown[]).includes(v.id)) return { ok: true, value: { kind: "macro", id: v.id as MacroId, ...display } };
  return fail("Comparação inválida");
}

function sanitizePane(v: unknown): R<PaneState> {
  if (!isObj(v)) return fail("Gráfico inválido");
  const symbol = typeof v.symbol === "string" ? v.symbol : "";
  if (!/^[A-Z0-9]{2,20}$/.test(symbol) || !splitSymbol(symbol)) return fail("Par inválido");
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
  return {
    ok: true,
    value: { symbol, interval: v.interval as ChartInterval, chartType: v.chartType as ChartType, scale: v.scale as ChartScale, indicators, overlays, compares },
  };
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
  return {
    ok: true,
    value: { visible, favorites, intervals: intervals.length ? intervals : [...DEFAULT_INTERVALS], favoriteIndicators, known: CHART_TOOLS.map((t) => t.name) },
  };
}
