// Cálculos dos indicadores próprios da aba Gráficos (funções puras, testadas sem navegador).
// Os indicadores prontos (MA, MACD, BOLL, RSI...) vêm da biblioteca KLineCharts.

export type Bar = { timestamp: number; open: number; high: number; low: number; close: number; volume?: number };
type N = number | null;

/** Média móvel exponencial; começa na média simples dos primeiros `period` valores. */
export function ema(values: number[], period: number): N[] {
  const out: N[] = values.map(() => null);
  if (period < 1 || values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** RSI de Wilder (0–100). */
export function rsi(closes: number[], period: number): N[] {
  const out: N[] = closes.map(() => null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  const value = () => (loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss));
  out[period] = value();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = value();
  }
  return out;
}

/** VWAP acumulado desde a primeira vela carregada: Σ(preço típico × volume) / Σ volume. */
export function vwap(bars: Bar[]): N[] {
  let pv = 0;
  let vol = 0;
  return bars.map((b) => {
    const v = b.volume ?? 0;
    pv += ((b.high + b.low + b.close) / 3) * v;
    vol += v;
    return vol > 0 ? pv / vol : null;
  });
}

/** Average True Range (média de Wilder da amplitude verdadeira). */
export function atr(bars: Bar[], period: number): N[] {
  const tr = bars.map((b, i) =>
    i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close)),
  );
  const out: N[] = bars.map(() => null);
  if (bars.length < period) return out;
  let prev = tr.slice(0, period).reduce((s, v) => s + v, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < bars.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

/** Money Flow Index (0–100): RSI ponderado pelo volume. */
export function mfi(bars: Bar[], period: number): N[] {
  const tp = bars.map((b) => (b.high + b.low + b.close) / 3);
  return bars.map((_, i) => {
    if (i < period) return null;
    let pos = 0;
    let neg = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const flow = tp[j] * (bars[j].volume ?? 0);
      if (tp[j] > tp[j - 1]) pos += flow;
      else if (tp[j] < tp[j - 1]) neg += flow;
    }
    if (neg === 0) return pos === 0 ? 50 : 100;
    return 100 - 100 / (1 + pos / neg);
  });
}

/** Média móvel simples dos últimos `period` valores (nulo se faltar algum). */
export const sma = (values: N[], period: number): N[] =>
  values.map((_, i) => {
    if (i < period - 1) return null;
    const win = values.slice(i - period + 1, i + 1);
    return win.some((v) => v === null) ? null : (win as number[]).reduce((s, v) => s + v, 0) / period;
  });

/** Estocástico RSI: %K (suavizado) e %D, de 0 a 100. */
export function stochRsi(closes: number[], rsiPeriod: number, stochPeriod: number, kSmooth: number, dSmooth: number): { k: N[]; d: N[] } {
  const r = rsi(closes, rsiPeriod);
  const raw: N[] = r.map((v, i) => {
    if (v === null || i < stochPeriod - 1) return null;
    const win = r.slice(i - stochPeriod + 1, i + 1);
    if (win.some((x) => x === null)) return null;
    const lo = Math.min(...(win as number[]));
    const hi = Math.max(...(win as number[]));
    return hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100;
  });
  const k = sma(raw, kSmooth);
  return { k, d: sma(k, dSmooth) };
}

/** Ichimoku: tenkan, kijun, nuvem (senkou A/B) e chikou (sem deslocamento: o gráfico desloca na hora de desenhar). */
export function ichimoku(bars: Bar[], tenkanP: number, kijunP: number, senkouBP: number) {
  const mid = (i: number, p: number): N => {
    if (i < p - 1) return null;
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - p + 1; j <= i; j++) {
      hi = Math.max(hi, bars[j].high);
      lo = Math.min(lo, bars[j].low);
    }
    return (hi + lo) / 2;
  };
  return bars.map((b, i) => {
    const tenkan = mid(i, tenkanP);
    const kijun = mid(i, kijunP);
    return {
      tenkan,
      kijun,
      senkouA: tenkan !== null && kijun !== null ? (tenkan + kijun) / 2 : null,
      senkouB: mid(i, senkouBP),
      chikou: b.close,
    };
  });
}

export type ProfileBin = { from: number; to: number; volume: number };
export type VolumeProfile = { bins: ProfileBin[]; pocIndex: number; valueArea: { low: number; high: number } };

/**
 * Volume Profile das velas `fromIndex..toIndex` (faixa visível): divide a faixa de preço em `rows`
 * faixas e reparte o volume de cada vela igualmente entre as faixas que ela toca.
 * POC = faixa com mais volume; área de valor = faixas em volta do POC até somar 70% do volume.
 */
export function volumeProfile(bars: Bar[], fromIndex: number, toIndex: number, rows: number, valueAreaShare = 0.7): VolumeProfile {
  const slice = bars.slice(Math.max(0, fromIndex), Math.min(bars.length - 1, toIndex) + 1);
  if (!slice.length || rows < 1) return { bins: [], pocIndex: -1, valueArea: { low: 0, high: 0 } };
  const lo = Math.min(...slice.map((b) => b.low));
  const hi = Math.max(...slice.map((b) => b.high));
  const step = hi > lo ? (hi - lo) / rows : 1;
  const bins: ProfileBin[] = Array.from({ length: rows }, (_, i) => ({ from: lo + i * step, to: lo + (i + 1) * step, volume: 0 }));
  const idx = (p: number) => Math.min(rows - 1, Math.max(0, Math.floor((p - lo) / step)));
  for (const b of slice) {
    const a = idx(b.low);
    const z = idx(b.high);
    const share = (b.volume ?? 0) / (z - a + 1);
    for (let i = a; i <= z; i++) bins[i].volume += share;
  }
  let pocIndex = 0;
  bins.forEach((b, i) => {
    if (b.volume > bins[pocIndex].volume) pocIndex = i;
  });
  const total = bins.reduce((s, b) => s + b.volume, 0);
  let low = pocIndex;
  let high = pocIndex;
  let acc = bins[pocIndex].volume;
  while (acc < total * valueAreaShare && (low > 0 || high < rows - 1)) {
    const below = low > 0 ? bins[low - 1].volume : -1;
    const above = high < rows - 1 ? bins[high + 1].volume : -1;
    if (above >= below) acc += bins[++high].volume;
    else acc += bins[--low].volume;
  }
  return { bins, pocIndex, valueArea: { low: bins[low].from, high: bins[high].to } };
}

export type Divergence = { kind: "bull" | "bear"; from: number; to: number };

/**
 * Divergências entre preço e RSI em pivôs (topos/fundos com `lookback` velas de cada lado):
 * baixa = preço com topo mais alto e RSI com topo mais baixo; alta = preço com fundo mais baixo e RSI com fundo mais alto.
 */
export function rsiDivergences(closes: number[], period: number, lookback: number): Divergence[] {
  const r = rsi(closes, period);
  const isPivot = (i: number, high: boolean) => {
    if (i < lookback || i + lookback >= closes.length || r[i] === null) return false;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (high ? closes[j] >= closes[i] : closes[j] <= closes[i]) return false;
    }
    return true;
  };
  const out: Divergence[] = [];
  let lastHigh = -1;
  let lastLow = -1;
  for (let i = 0; i < closes.length; i++) {
    if (isPivot(i, true)) {
      if (lastHigh >= 0 && closes[i] > closes[lastHigh] && (r[i] as number) < (r[lastHigh] as number)) out.push({ kind: "bear", from: lastHigh, to: i });
      lastHigh = i;
    }
    if (isPivot(i, false)) {
      if (lastLow >= 0 && closes[i] < closes[lastLow] && (r[i] as number) > (r[lastLow] as number)) out.push({ kind: "bull", from: lastLow, to: i });
      lastLow = i;
    }
  }
  return out;
}

/** Delta por vela (compras agressoras − vendas agressoras) e CVD (delta acumulado). */
export function deltaSeries(bars: (Bar & { buyVolume?: number })[]): { delta: N[]; cvd: N[] } {
  let acc = 0;
  const delta: N[] = [];
  const cvd: N[] = [];
  for (const b of bars) {
    if (typeof b.buyVolume === "number" && typeof b.volume === "number") {
      const d = b.buyVolume - (b.volume - b.buyVolume);
      acc += d;
      delta.push(d);
    } else delta.push(null);
    cvd.push(acc);
  }
  return { delta, cvd };
}

export type LiqLevel = { side: "long" | "short"; price: number; from: number; to: number | null; notional: number };

/** Faixas de alavancagem típicas usadas na estimativa (peso = fatia das posições novas). */
export const DEFAULT_LEVERAGE_TIERS = [
  { leverage: 10, weight: 0.35 },
  { leverage: 25, weight: 0.3 },
  { leverage: 50, weight: 0.2 },
  { leverage: 100, weight: 0.15 },
];
const MAINTENANCE = 0.005;

/**
 * Níveis ESTIMADOS de liquidação: quando o open interest (OI) sobe numa vela, as posições novas
 * (metade compradas, metade vendidas, ao preço típico da vela) são distribuídas pelas faixas de
 * alavancagem; o nível de liquidação de cada uma fica abaixo (compras) ou acima (vendas) do preço.
 * Um nível é considerado liquidado (to = índice da vela) quando o preço o atinge depois.
 */
export function liquidationLevels(
  bars: Bar[],
  oi: [number, number][],
  tiers: { leverage: number; weight: number }[] = DEFAULT_LEVERAGE_TIERS,
): LiqLevel[] {
  const sorted = [...oi].sort((a, b) => a[0] - b[0]);
  let k = -1;
  const oiAt = bars.map((b) => {
    while (k + 1 < sorted.length && sorted[k + 1][0] <= b.timestamp) k++;
    return k >= 0 ? sorted[k][1] : null;
  });
  const levels: LiqLevel[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = oiAt[i - 1];
    const cur = oiAt[i];
    if (prev === null || cur === null || cur <= prev) continue;
    const price = (bars[i].high + bars[i].low + bars[i].close) / 3;
    const half = ((cur - prev) * price) / 2;
    for (const t of tiers) {
      levels.push({ side: "long", price: price * (1 - 1 / t.leverage + MAINTENANCE), from: i, to: null, notional: half * t.weight });
      levels.push({ side: "short", price: price * (1 + 1 / t.leverage - MAINTENANCE), from: i, to: null, notional: half * t.weight });
    }
  }
  for (const l of levels) {
    for (let j = l.from + 1; j < bars.length; j++) {
      if (l.side === "long" ? bars[j].low <= l.price : bars[j].high >= l.price) {
        l.to = j;
        break;
      }
    }
  }
  return levels;
}
