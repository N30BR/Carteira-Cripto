// Fluxo de agressão por preço (Delta Horizontal e Footprint) a partir de VELAS MENORES REAIS da Binance.
//
// Fonte: cada vela da Binance traz o volume total e o volume COMPRADOR AGRESSOR (taker buy); o vendedor agressor é a
// diferença. Isso é real, mas por vela — não por preço. Para ver o fluxo por preço dentro de uma vela do gráfico,
// usam-se as velas menores que a compõem (ex.: 1 min dentro de 1 h): cada vela menor tem as suas compras/vendas
// agressoras reais, repartidas por igual pela faixa de preço dela (mínima–máxima). Não é o dado tick a tick (a fita de
// negócios), mas não inventa números: quanto menor a vela de base, mais fiel. Sem o volume comprador (pares
// sintéticos, índices), não há fluxo.

export type FlowBar = { timestamp: number; open: number; high: number; low: number; close: number; volume?: number; buyVolume?: number };

/** Vela com compra/venda agressora conhecida (volume comprador real dentro do volume total). */
export const hasFlow = (b: FlowBar) => typeof b.buyVolume === "number" && typeof b.volume === "number" && b.buyVolume >= 0 && b.buyVolume <= b.volume && b.volume > 0;

const MIN = 60_000;
/** Tempos de base possíveis para as velas menores (os da Binance). */
export const SUB_INTERVALS: { id: string; ms: number }[] = [
  { id: "1m", ms: MIN },
  { id: "5m", ms: 5 * MIN },
  { id: "15m", ms: 15 * MIN },
  { id: "30m", ms: 30 * MIN },
  { id: "1h", ms: 60 * MIN },
  { id: "4h", ms: 240 * MIN },
  { id: "1d", ms: 1440 * MIN },
];

/**
 * Vela de base para um trecho de `spanMs` com velas de `barMs`: a menor que caiba no orçamento de velas (pedidos à
 * Binance) e que divida a vela do gráfico em pelo menos 4 partes. null = não há base menor (ex.: gráfico de 1 min).
 */
export function pickSubInterval(barMs: number, spanMs: number, budget = 5000): { id: string; ms: number } | null {
  for (const s of SUB_INTERVALS) {
    if (s.ms * 4 > barMs) break;
    if (spanMs / s.ms <= budget) return s;
  }
  return null;
}

export type FlowLevel = { from: number; to: number; buy: number; sell: number };

/** Reparte compras/vendas agressoras de velas menores pelas faixas [lo + k·step, lo + (k+1)·step). */
function spread(levels: FlowLevel[], lo: number, step: number, sub: FlowBar[]): number {
  let used = 0;
  for (const b of sub) {
    if (!hasFlow(b)) continue;
    used++;
    const buy = b.buyVolume as number;
    const sell = (b.volume as number) - buy;
    const range = b.high - b.low;
    const a = Math.max(0, Math.floor((b.low - lo) / step));
    const z = Math.min(levels.length - 1, Math.floor((b.high - lo) / step));
    for (let k = a; k <= z; k++) {
      const L = levels[k];
      const share = range > 0 ? Math.max(0, Math.min(b.high, L.to) - Math.max(b.low, L.from)) / range : b.low >= L.from && b.low < L.to ? 1 : 0;
      if (!share) continue;
      L.buy += buy * share;
      L.sell += sell * share;
    }
  }
  return used;
}

/** Delta por faixa de preço (perfil horizontal) com as velas menores do trecho analisado, na faixa lo–hi. */
export function deltaProfile(sub: FlowBar[], lo: number, hi: number, rows: number): { levels: FlowLevel[]; used: number } {
  if (!(hi > lo) || rows < 1) return { levels: [], used: 0 };
  const step = (hi - lo) / rows;
  const levels = Array.from({ length: rows }, (_, k) => ({ from: lo + k * step, to: lo + (k + 1) * step, buy: 0, sell: 0 }));
  const used = spread(levels, lo, step, sub);
  return { levels, used };
}

export type FootprintSettings = {
  /** Granularidade: "auto" (≈ `levels` faixas na vela média), "atr" (ATR/`levels`), "count" (cada vela em `levels`). */
  rowMode: "auto" | "atr" | "count";
  levels: number;
  atrPeriod: number;
  /** Imbalance (diagonal): compras ≥ ratio% das vendas do nível de baixo (e vice-versa). */
  imbalancePct: number;
  imbalanceMin: number;
  stackedMin: number;
  valueAreaPct: number;
};

export type FootprintCandle = {
  timestamp: number;
  levels: (FlowLevel & { delta: number; buyImb: boolean; sellImb: boolean; stackedBuy: boolean; stackedSell: boolean })[];
  delta: number;
  volume: number;
  pocIndex: number;
  vaLow: number;
  vaHigh: number;
  /** Velas menores usadas (0 = sem fluxo nesta vela). */
  used: number;
};

/** Tamanho da faixa de preço do Footprint para um conjunto de velas do gráfico. */
export function footprintStep(bars: FlowBar[], s: Pick<FootprintSettings, "rowMode" | "levels" | "atrPeriod">): number | null {
  if (!bars.length) return null;
  const n = Math.max(2, Math.min(60, Math.round(s.levels)));
  if (s.rowMode === "atr") {
    const p = Math.max(2, Math.min(200, Math.round(s.atrPeriod)));
    const tr: number[] = [];
    for (let i = 1; i < bars.length; i++) tr.push(Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close)));
    const last = tr.slice(-p);
    const atr = last.length ? last.reduce((a, b) => a + b, 0) / last.length : bars[0].high - bars[0].low;
    return atr > 0 ? nice(atr / n) : null;
  }
  const avg = bars.reduce((a, b) => a + (b.high - b.low), 0) / bars.length;
  return avg > 0 ? nice(avg / n) : null;
}

/** Arredonda para 1, 2, 2,5 ou 5 × potência de 10 (faixas com preços "redondos"). */
function nice(x: number): number {
  const p = 10 ** Math.floor(Math.log10(x));
  const m = x / p;
  return (m < 1.5 ? 1 : m < 2.25 ? 2 : m < 3.5 ? 2.5 : m < 7.5 ? 5 : 10) * p;
}

/** Footprint de uma vela do gráfico com as velas menores dentro dela. `step` null + rowMode "count" = `levels` faixas. */
export function footprintCandle(candle: FlowBar, sub: FlowBar[], step: number | null, s: FootprintSettings): FootprintCandle {
  const base = { timestamp: candle.timestamp, levels: [], delta: 0, volume: 0, pocIndex: -1, vaLow: 0, vaHigh: 0, used: 0 };
  if (!(candle.high >= candle.low)) return base;
  let lo: number;
  let st: number;
  let rows: number;
  if (s.rowMode === "count" || !step) {
    rows = Math.max(2, Math.min(60, Math.round(s.levels)));
    lo = candle.low;
    st = (candle.high - candle.low) / rows || 1;
  } else {
    st = step;
    lo = Math.floor(candle.low / st) * st;
    rows = Math.max(1, Math.min(200, Math.floor((candle.high - lo) / st) + 1));
  }
  const raw: FlowLevel[] = Array.from({ length: rows }, (_, k) => ({ from: lo + k * st, to: lo + (k + 1) * st, buy: 0, sell: 0 }));
  const used = spread(raw, lo, st, sub);
  if (!used) return { ...base, used: 0 };
  const ratio = Math.max(100, s.imbalancePct) / 100;
  const minV = Math.max(0, s.imbalanceMin);
  // Imbalance diagonal: compras no nível k contra vendas no nível k−1 (abaixo); vendas no k contra compras no k+1.
  const levels = raw.map((L, k) => {
    const below = raw[k - 1];
    const above = raw[k + 1];
    const buyImb = L.buy >= minV && L.buy > 0 && (below ? L.buy >= ratio * Math.max(below.sell, 1e-12) : false);
    const sellImb = L.sell >= minV && L.sell > 0 && (above ? L.sell >= ratio * Math.max(above.buy, 1e-12) : false);
    return { ...L, delta: L.buy - L.sell, buyImb, sellImb, stackedBuy: false, stackedSell: false };
  });
  // Imbalances "empilhados": `stackedMin` níveis seguidos no mesmo lado.
  const stack = (key: "buyImb" | "sellImb", flag: "stackedBuy" | "stackedSell") => {
    let run = 0;
    for (let k = 0; k <= levels.length; k++) {
      if (k < levels.length && levels[k][key]) run++;
      else {
        if (run >= Math.max(2, s.stackedMin)) for (let j = k - run; j < k; j++) levels[j][flag] = true;
        run = 0;
      }
    }
  };
  stack("buyImb", "stackedBuy");
  stack("sellImb", "stackedSell");
  const vol = levels.map((L) => L.buy + L.sell);
  const volume = vol.reduce((a, b) => a + b, 0);
  const delta = levels.reduce((a, L) => a + L.delta, 0);
  let poc = 0;
  vol.forEach((v, k) => {
    if (v > vol[poc]) poc = k;
  });
  // Área de valor: a partir do POC, soma o lado de mais volume até chegar à % pedida (sem supor simetria).
  let a = poc;
  let z = poc;
  let acc = vol[poc];
  const target = (volume * Math.max(10, Math.min(100, s.valueAreaPct))) / 100;
  while (acc < target && (a > 0 || z < vol.length - 1)) {
    const down = a > 0 ? vol[a - 1] : -1;
    const up = z < vol.length - 1 ? vol[z + 1] : -1;
    if (up >= down) acc += vol[++z];
    else acc += vol[--a];
  }
  return { timestamp: candle.timestamp, levels, delta, volume, pocIndex: poc, vaLow: levels[a].from, vaHigh: levels[z].to, used };
}

/** Velas menores de cada vela do gráfico (por horário), já ordenadas. */
export function groupSub(candles: FlowBar[], barMs: number, sub: FlowBar[]): Map<number, FlowBar[]> {
  const out = new Map<number, FlowBar[]>();
  if (!candles.length) return out;
  const starts = candles.map((c) => c.timestamp);
  let i = 0;
  for (const b of sub) {
    while (i + 1 < starts.length && starts[i + 1] <= b.timestamp) i++;
    const s = starts[i];
    if (b.timestamp < s || b.timestamp >= s + barMs) continue;
    let list = out.get(s);
    if (!list) out.set(s, (list = []));
    list.push(b);
  }
  return out;
}
