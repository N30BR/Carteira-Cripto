// CMC Crypto Fear and Greed Index (CoinMarketCap): leitura das respostas da API e cálculos da seção da aba Cripto.
// Tudo puro (testável sem rede). Classificação: SEMPRE a que a CoinMarketCap devolve em cada observação; aqui só se
// traduz o nome. As cores são apenas visuais (escala contínua de 0 a 100).

const DAY = 86_400_000;

/** Observação diária: t = 00:00 UTC do dia da observação (o timestamp da fonte), não a hora da consulta. */
export type FgPoint = { t: number; value: number; label: string };
export type FgLatest = { value: number; label: string; updatedAt: number };
/** Dia do BTC (Binance, BTC/USDT): t = 00:00 UTC; close = fechamento do dia (parcial no dia corrente); volume em USDT. */
export type BtcDay = { t: number; close: number; volume: number };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const validValue = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
const cleanLabel = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 40) : "");

/** GET /v3/fear-and-greed/latest → { data: { value, update_time, value_classification } }. */
export function parseFgLatest(body: unknown): FgLatest {
  const d = isObj(body) && isObj(body.data) ? body.data : null;
  const updatedAt = d && typeof d.update_time === "string" ? Date.parse(d.update_time) : NaN;
  if (!d || !validValue(d.value) || !cleanLabel(d.value_classification) || !Number.isFinite(updatedAt)) throw new Error("Resposta inválida");
  return { value: d.value, label: cleanLabel(d.value_classification), updatedAt };
}

/** GET /v3/fear-and-greed/historical → { data: [{ timestamp (s, texto), value, value_classification }] }. */
export function parseFgHistory(body: unknown): FgPoint[] {
  const list = isObj(body) && Array.isArray(body.data) ? body.data : null;
  if (!list) throw new Error("Resposta inválida");
  const out: FgPoint[] = [];
  for (const r of list) {
    if (!isObj(r)) continue;
    const s = Number(r.timestamp);
    const label = cleanLabel(r.value_classification);
    if (!Number.isFinite(s) || s <= 0 || !validValue(r.value) || !label) continue;
    out.push({ t: s * 1000, value: r.value, label });
  }
  return out;
}

/** Junta páginas, ordena do mais antigo ao mais recente e remove dias repetidos (fica a última leitura do dia). */
export function mergeFgHistory(pages: FgPoint[][]): FgPoint[] {
  const byDay = new Map<number, FgPoint>();
  for (const p of pages.flat()) byDay.set(Math.floor(p.t / DAY) * DAY, { ...p, t: Math.floor(p.t / DAY) * DAY });
  return [...byDay.values()].sort((a, b) => a.t - b.t);
}

const PT: Record<string, string> = {
  "extreme fear": "Medo extremo",
  fear: "Medo",
  neutral: "Neutro",
  greed: "Ganância",
  "extreme greed": "Ganância extrema",
};
/** Nome da classificação da fonte em português (desconhecida: o texto original). */
export const labelPt = (label: string) => PT[label.trim().toLowerCase()] ?? label;

// Vermelho → laranja → amarelo → verde-claro → verde (tons moderados, sobre fundo escuro).
const STOPS: [number, [number, number, number]][] = [
  [0, [229, 72, 77]],
  [25, [240, 140, 58]],
  [50, [229, 197, 58]],
  [75, [143, 207, 74]],
  [100, [47, 179, 111]],
];
/** Cor do valor 0–100, com transição suave entre as faixas. */
export function fgColor(value: number): string {
  const v = Math.max(0, Math.min(100, value));
  let i = 0;
  while (i < STOPS.length - 2 && v > STOPS[i + 1][0]) i++;
  const [a, ca] = STOPS[i];
  const [b, cb] = STOPS[i + 1];
  const k = (v - a) / (b - a);
  const c = ca.map((x, j) => Math.round(x + (cb[j] - x) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export type FgReference = { key: "yesterday" | "week" | "month"; title: string; target: number; point: FgPoint | null; exact: boolean };

/**
 * Ontem, 7 dias e 30 dias antes do dia corrente (UTC): a OBSERVAÇÃO daquele dia (não média). Sem observação no dia
 * exato, usa a anterior mais próxima (até 3 dias) e marca exact = false, para a tela dizer a data usada.
 */
export function fgReferences(history: FgPoint[], now: number): FgReference[] {
  const today = Math.floor(now / DAY) * DAY;
  const refs: [FgReference["key"], string, number][] = [
    ["yesterday", "Ontem", 1],
    ["week", "Última semana", 7],
    ["month", "Último mês", 30],
  ];
  return refs.map(([key, title, days]) => {
    const target = today - days * DAY;
    let found: FgPoint | null = null;
    for (const p of history) {
      if (p.t > target) break;
      if (p.t >= target - 3 * DAY) found = p;
    }
    return { key, title, target, point: found, exact: !!found && found.t === target };
  });
}

/** Máximo e mínimo dos últimos 365 dias até a observação mais recente (em empate, a data mais recente). */
export function fgYearRange(history: FgPoint[]): { max: FgPoint; min: FgPoint } | null {
  const last = history.at(-1);
  if (!last) return null;
  const from = last.t - 365 * DAY;
  let max: FgPoint | null = null;
  let min: FgPoint | null = null;
  for (const p of history) {
    if (p.t <= from) continue;
    if (!max || p.value >= max.value) max = p;
    if (!min || p.value <= min.value) min = p;
  }
  return max && min ? { max, min } : null;
}

export const FG_RANGES = ["1S", "1M", "3M", "6M", "1A", "Tudo"] as const;
export type FgRange = (typeof FG_RANGES)[number];
/** Dias de cada período (1M = os mesmos 30 dias do antigo "30D"). */
export const FG_RANGE_DAYS: Record<Exclude<FgRange, "Tudo">, number> = { "1S": 7, "1M": 30, "3M": 90, "6M": 182, "1A": 365 };
/** Janela do gráfico, contada a partir da observação mais recente. */
export function fgWindow<T extends { t: number }>(points: T[], range: FgRange, lastT: number): T[] {
  if (range === "Tudo") return points;
  const days = FG_RANGE_DAYS[range];
  return points.filter((p) => p.t > lastT - days * DAY);
}
