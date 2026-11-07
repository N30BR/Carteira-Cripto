// Leitura dos indicadores on-chain (funções puras, testadas sem rede).
//
// CRITÉRIO (documentado também na tela):
// 1. Cada indicador tem uma "leitura" — o próprio valor (MVRV Z, NUPL, Puell, RHODL, Reserve Risk), a média de 7 dias
//    (SOPR, STH-SOPR), o preço do BTC ÷ preço realizado (Realized Price, STH Realized Price) ou a soma de 30 dias
//    (Exchange Netflow).
// 2. Posição = percentil da leitura atual dentro de toda a história do próprio indicador desde 2012 (0 = menor já
//    visto, 100 = maior). Alto = mercado mais aquecido; baixo = mais frio. Sem 365 dias de história, não há posição.
// 3. Faixas: < 10 Fundo · < 30 Acumulação · < 70 Neutro · < 90 Aquecimento · ≥ 90 Topo (nomes ajustados à natureza
//    de cada métrica: SOPR abaixo de 1 = prejuízo realizado; netflow negativo = saída das corretoras).
// 4. Intensidade (0–100) = distância da posição até o meio (|posição − 50| × 2). NÃO é probabilidade de alta ou queda.
// 5. Leitura do ciclo: indicadores muito parecidos contam como um grupo só (valor, lucro realizado, mineradores,
//    detentores de longo prazo, fluxos). A posição do ciclo é a média dos grupos disponíveis (cada grupo = média dos
//    seus indicadores); com menos de 3 grupos, fica "Indefinido". Indicadores indisponíveis não contam como zero.
import type { OnchainId } from "@/lib/charts/onchain-ids";
import { DAY, type Pt, dayStart } from "./calc";

export type Category = "Fundo" | "Acumulação" | "Capitulação" | "Neutro" | "Expansão" | "Aquecimento" | "Topo" | "Distribuição";
export const BOTTOM: Category[] = ["Fundo", "Acumulação", "Capitulação"];
export const TOP: Category[] = ["Topo", "Aquecimento", "Distribuição"];

export type Reading = {
  /** Leitura atual (na unidade da leitura, ex.: razão preço/RP). */
  reading: number;
  /** Percentil 0–100 na história do próprio indicador. */
  position: number;
  category: Category;
  /** 0–100: quão longe do meio (não é probabilidade). */
  intensity: number;
  /** Texto curto sobre o que a leitura significa agora. */
  label: string;
};

const START = Date.UTC(2012, 0, 1);
const MIN_HISTORY = 365;

/** Média móvel de n pontos consecutivos (por data). */
function rolling(points: Pt[], n: number, fn: "mean" | "sum"): Pt[] {
  const out: Pt[] = [];
  let acc = 0;
  for (let i = 0; i < points.length; i++) {
    acc += points[i][1];
    if (i >= n) acc -= points[i - n][1];
    if (i >= n - 1) out.push([points[i][0], fn === "mean" ? acc / n : acc]);
  }
  return out;
}

/** Razão ponto a ponto (mesmo dia UTC) entre duas séries. */
export function ratio(num: Pt[], den: Pt[]): Pt[] {
  const d = new Map(den.map(([t, v]) => [dayStart(t), v]));
  const out: Pt[] = [];
  for (const [t, v] of num) {
    const b = d.get(dayStart(t));
    if (b !== undefined && b > 0) out.push([t, v / b]);
  }
  return out;
}

/** Série de leituras de um indicador (ver critério no topo). `price` = preço diário do BTC. */
export function readingSeries(id: OnchainId, points: Pt[], price: Pt[]): Pt[] {
  const s = [...points].sort((a, b) => a[0] - b[0]);
  switch (id) {
    case "SOPR":
    case "STH_SOPR":
      return rolling(s, 7, "mean");
    case "EXCHANGE_NETFLOW":
      return rolling(s, 30, "sum");
    case "REALIZED_PRICE":
    case "STH_REALIZED_PRICE":
      return ratio(price, s);
    default:
      return s;
  }
}

/** Percentil (0–100) do último valor dentro da série (empates contam pela metade). */
export function percentile(values: number[], v: number): number {
  if (!values.length) return 50;
  let below = 0;
  let equal = 0;
  for (const x of values) {
    if (x < v) below++;
    else if (x === v) equal++;
  }
  return ((below + equal / 2) / values.length) * 100;
}

function band(p: number): Category {
  if (p < 10) return "Fundo";
  if (p < 30) return "Acumulação";
  if (p < 70) return "Neutro";
  if (p < 90) return "Aquecimento";
  return "Topo";
}

/** Classifica a leitura atual de um indicador; null sem história suficiente (nunca inventa nota). */
export function classify(id: OnchainId, points: Pt[], price: Pt[]): Reading | null {
  const series = readingSeries(id, points, price).filter(([t, v]) => t >= START && Number.isFinite(v));
  if (series.length < MIN_HISTORY) return null;
  const reading = series[series.length - 1][1];
  const position = percentile(
    series.map(([, v]) => v),
    reading,
  );
  const intensity = Math.round(Math.abs(position - 50) * 2);
  let category = band(position);
  let label: string;
  switch (id) {
    case "SOPR":
    case "STH_SOPR":
      // Referência 1: abaixo = moedas movimentadas com prejuízo (média de 7 dias).
      if (reading < 1) {
        category = position < 10 ? "Capitulação" : "Acumulação";
        label = "Prejuízo realizado (média 7d < 1)";
      } else {
        category = position >= 90 ? "Aquecimento" : "Expansão";
        label = "Lucro realizado (média 7d > 1)";
      }
      break;
    case "EXCHANGE_NETFLOW":
      if (reading < 0) {
        category = position < 30 ? "Acumulação" : "Neutro";
        label = "Saída líquida das corretoras (30d)";
      } else {
        category = position >= 70 ? "Distribuição" : "Neutro";
        label = "Entrada líquida nas corretoras (30d)";
      }
      break;
    case "REALIZED_PRICE":
      if (reading < 1) {
        category = "Fundo";
        label = "BTC abaixo do preço realizado";
      } else label = "BTC acima do preço realizado";
      break;
    case "STH_REALIZED_PRICE":
      label = reading < 1 ? "Compradores recentes no prejuízo" : "Compradores recentes no lucro";
      if (reading < 1 && category === "Neutro") category = "Acumulação";
      break;
    case "NUPL":
      if (reading < 0) {
        category = "Capitulação";
        label = "Rede em prejuízo não realizado";
      } else label = reading > 0.75 ? "Euforia (lucro não realizado muito alto)" : "Rede em lucro não realizado";
      break;
    default:
      label = { Fundo: "Região historicamente baixa", Acumulação: "Abaixo da média histórica", Neutro: "Faixa intermediária", Aquecimento: "Acima da média histórica", Topo: "Região historicamente alta" }[
        band(position) as "Fundo" | "Acumulação" | "Neutro" | "Aquecimento" | "Topo"
      ];
  }
  return { reading, position, category, intensity, label };
}

// ---------- Leitura consolidada ----------

export const GROUPS: { id: string; label: string; members: OnchainId[] }[] = [
  { id: "valor", label: "Valor (MVRV, NUPL, preço realizado)", members: ["MVRV_Z", "NUPL", "REALIZED_PRICE"] },
  { id: "lucro", label: "Lucro realizado (SOPR, STH-SOPR, STH RP)", members: ["SOPR", "STH_SOPR", "STH_REALIZED_PRICE"] },
  { id: "mineradores", label: "Mineradores (Puell)", members: ["PUELL"] },
  { id: "longo", label: "Longo prazo (RHODL, Reserve Risk)", members: ["RHODL", "RESERVE_RISK"] },
  { id: "fluxos", label: "Fluxos (Exchange Netflow)", members: ["EXCHANGE_NETFLOW"] },
];

export type CycleState = "Capitulação" | "Acumulação" | "Expansão" | "Aquecimento" | "Distribuição" | "Indefinido";

export type Consolidated = {
  available: number;
  total: number;
  bottom: number;
  top: number;
  neutral: number;
  /** Posição do ciclo 0–100 (média dos grupos); null com menos de 3 grupos. */
  score: number | null;
  state: CycleState;
  groups: { id: string; label: string; position: number | null; members: number }[];
  convergences: string[];
  divergences: string[];
  attention: OnchainId[];
};

export function cycleState(score: number | null): CycleState {
  if (score === null) return "Indefinido";
  if (score < 15) return "Capitulação";
  if (score < 35) return "Acumulação";
  if (score < 65) return "Expansão";
  if (score < 85) return "Aquecimento";
  return "Distribuição";
}

const side = (p: number) => (p < 40 ? "frio" : p > 60 ? "quente" : "meio");

export function consolidate(readings: Partial<Record<OnchainId, Reading | null>>, total = 10): Consolidated {
  const entries = Object.entries(readings).filter((e): e is [OnchainId, Reading] => !!e[1]);
  const groups = GROUPS.map((g) => {
    const ps = g.members.map((m) => readings[m]?.position).filter((p): p is number => typeof p === "number");
    return { id: g.id, label: g.label, position: ps.length ? ps.reduce((s, p) => s + p, 0) / ps.length : null, members: ps.length };
  });
  const usable = groups.filter((g) => g.position !== null) as { id: string; label: string; position: number; members: number }[];
  const score = usable.length >= 3 ? usable.reduce((s, g) => s + g.position, 0) / usable.length : null;
  const cold = usable.filter((g) => side(g.position) === "frio");
  const hot = usable.filter((g) => side(g.position) === "quente");
  const convergences: string[] = [];
  const divergences: string[] = [];
  if (usable.length >= 2 && cold.length === usable.length) convergences.push("Todos os grupos em região historicamente fria (abaixo do meio).");
  else if (usable.length >= 2 && hot.length === usable.length) convergences.push("Todos os grupos em região historicamente quente (acima do meio).");
  else {
    if (cold.length >= 2) convergences.push(`Região fria em: ${cold.map((g) => g.label).join("; ")}.`);
    if (hot.length >= 2) convergences.push(`Região quente em: ${hot.map((g) => g.label).join("; ")}.`);
  }
  if (cold.length && hot.length) divergences.push(`${hot.map((g) => g.label).join("; ")} quente × ${cold.map((g) => g.label).join("; ")} frio.`);
  return {
    available: entries.length,
    total,
    bottom: entries.filter(([, r]) => BOTTOM.includes(r.category)).length,
    top: entries.filter(([, r]) => TOP.includes(r.category)).length,
    neutral: entries.filter(([, r]) => !BOTTOM.includes(r.category) && !TOP.includes(r.category)).length,
    score: score === null ? null : Math.round(score),
    state: cycleState(score),
    groups,
    convergences,
    divergences,
    attention: entries.filter(([, r]) => r.intensity >= 70).map(([id]) => id),
  };
}

// ---------- Modelos do ciclo (a partir do preço diário) ----------

const smaLast = (vals: number[], n: number) => (vals.length >= n ? vals.slice(-n).reduce((s, v) => s + v, 0) / n : null);

/**
 * Pi Cycle Top: média de 111 dias contra 2 × média de 350 dias. Cruzamento para cima marcou topos de ciclos
 * anteriores (sinal raro; não é garantia). Devolve as médias atuais e se houve cruzamento nos últimos 30 dias.
 */
export function piCycle(price: Pt[]): { fast: number; slow: number; distancePct: number; crossedRecently: boolean } | null {
  const v = price.map(([, x]) => x);
  if (v.length < 350 + 30) return null;
  const at = (end: number) => {
    const slice = v.slice(0, end);
    const f = smaLast(slice, 111);
    const s = smaLast(slice, 350);
    return f === null || s === null ? null : { fast: f, slow: 2 * s };
  };
  const now = at(v.length);
  if (!now) return null;
  let crossedRecently = false;
  for (let k = 1; k <= 30; k++) {
    const a = at(v.length - k);
    const b = at(v.length - k + 1);
    if (a && b && a.fast <= a.slow && b.fast > b.slow) crossedRecently = true;
  }
  return { ...now, distancePct: ((now.fast - now.slow) / now.slow) * 100, crossedRecently };
}

/**
 * Bull Market Support Band: SMA de 20 semanas e EMA de 21 semanas dos fechamentos semanais (domingo, UTC).
 * Estado: preço acima, dentro ou abaixo da banda.
 */
export function bullBand(price: Pt[]): { sma20w: number; ema21w: number; price: number; state: "Acima" | "Dentro" | "Abaixo" } | null {
  if (!price.length) return null;
  // Fechamento de cada semana (último dia de cada semana UTC, semana começando na segunda).
  const weeks = new Map<number, number>();
  for (const [t, v] of price) {
    const d = new Date(dayStart(t));
    const monday = dayStart(t) - ((d.getUTCDay() + 6) % 7) * DAY;
    weeks.set(monday, v);
  }
  const closes = [...weeks.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  if (closes.length < 30) return null;
  const sma20 = smaLast(closes, 20) as number;
  const k = 2 / 22;
  let e = closes.slice(0, 21).reduce((s, x) => s + x, 0) / 21;
  for (let i = 21; i < closes.length; i++) e = closes[i] * k + e * (1 - k);
  const p = price[price.length - 1][1];
  const lo = Math.min(sma20, e);
  const hi = Math.max(sma20, e);
  return { sma20w: sma20, ema21w: e, price: p, state: p > hi ? "Acima" : p < lo ? "Abaixo" : "Dentro" };
}
