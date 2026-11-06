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

const sma = (values: N[], period: number): N[] =>
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
export function volumeProfile(bars: Bar[], fromIndex: number, toIndex: number, rows: number): VolumeProfile {
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
  while (acc < total * 0.7 && (low > 0 || high < rows - 1)) {
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
