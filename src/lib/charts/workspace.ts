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
  { name: "VOLUME_PROFILE", label: "Volume Profile (faixa visível)", pane: "main", params: [24] },
  { name: "AVP", label: "Preço médio (AVP)", pane: "main", params: [] },
  // Em painel próprio
  { name: "VOL", label: "Volume", pane: "sub", params: [5, 10, 20] },
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
  { name: "parallelStraightLine", label: "Linhas paralelas" },
  { name: "priceChannelLine", label: "Canal de preço" },
  { name: "fibonacciLine", label: "Retração de Fibonacci" },
  { name: "rectangle", label: "Retângulo" },
  { name: "measure", label: "Medir (preço e %)" },
  { name: "simpleAnnotation", label: "Anotação" },
  { name: "simpleTag", label: "Etiqueta" },
];
const TOOL_NAMES = new Set(CHART_TOOLS.map((t) => t.name));
export const DEFAULT_FAVORITE_TOOLS = ["segment", "horizontalStraightLine", "fibonacciLine", "rectangle"];

export type IndicatorState = { name: string; params: number[]; pane: "main" | "sub" };
export type OverlayState = { name: string; points: { timestamp: number; value: number }[]; text?: string };
/** Série comparada na mesma divisão: outro par da Binance (ex.: ouro PAXGUSDT) ou série macro do FRED. */
export type CompareState = { kind: "pair"; id: string } | { kind: "macro"; id: MacroId };
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
export type ToolPrefs = { visible: string[]; favorites: string[] };

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
export const defaultPrefs = (): ToolPrefs => ({ visible: CHART_TOOLS.map((t) => t.name), favorites: [...DEFAULT_FAVORITE_TOOLS] });

type R<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
// Sem caracteres de controle nem invisíveis/de direção.
const SAFE_TEXT = /^[^\p{Cc}\p{Cf}]*$/u;

function sanitizeIndicator(v: unknown): R<IndicatorState> {
  if (!isObj(v) || typeof v.name !== "string" || !INDICATOR_NAMES.has(v.name)) return fail("Indicador inválido");
  if (!Array.isArray(v.params) || v.params.length > LIMITS.paramsPerIndicator || !v.params.every((p) => isNum(p) && Math.abs(p) <= 10_000)) {
    return fail("Parâmetros do indicador inválidos");
  }
  if (v.pane !== "main" && v.pane !== "sub") return fail("Painel do indicador inválido");
  return { ok: true, value: { name: v.name, params: v.params as number[], pane: v.pane } };
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
  return { ok: true, value: out };
}

function sanitizeCompare(v: unknown): R<CompareState> {
  if (!isObj(v)) return fail("Comparação inválida");
  if (v.kind === "pair" && typeof v.id === "string" && /^[A-Z0-9]{2,20}$/.test(v.id) && splitSymbol(v.id)) return { ok: true, value: { kind: "pair", id: v.id } };
  if (v.kind === "macro" && (MACRO_IDS as readonly unknown[]).includes(v.id)) return { ok: true, value: { kind: "macro", id: v.id as MacroId } };
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
  const visible = [...new Set([...pick(v.visible), ...favorites])];
  return { ok: true, value: { visible, favorites } };
}
