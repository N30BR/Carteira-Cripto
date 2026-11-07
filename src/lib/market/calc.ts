// Cálculos da aba Cripto (funções puras, testadas sem rede). Só combinam dados reais das fontes;
// datas sem algum dado ficam de fora (nada é interpolado nem inventado).
import type { MarketId } from "./ids";

export type Pt = [number, number];
export const DAY = 86_400_000;
export const dayStart = (t: number) => Math.floor(t / DAY) * DAY;

/**
 * Coin Metrics marca o valor diário com o dia D (fechamento às 24:00 de D). A CoinMarketCap e a DefiLlama marcam o
 * mesmo instante como 00:00 do dia D+1. Alinha a Coin Metrics para 00:00 do dia seguinte.
 */
export const closeToNextDay = (points: Pt[]): Pt[] => points.map(([t, v]) => [dayStart(t) + DAY, v]);

const byDay = (points: Pt[]) => new Map(points.map(([t, v]) => [dayStart(t), v]));

export type AggregateInput = {
  /** Market cap das altcoins (todas menos o BTC) da CoinMarketCap, 00:00 UTC de cada dia. */
  alt: Pt[];
  /** Market caps (Coin Metrics, já alinhados com closeToNextDay). */
  btc: Pt[];
  eth: Pt[];
  usdt: Pt[];
  usdc: Pt[];
  /** Soma das stablecoins (DefiLlama), 00:00 UTC. */
  stables: Pt[];
};

/**
 * Séries diárias de capitalização e dominância:
 * TOTAL = altcoins + BTC; TOTAL2 = altcoins; TOTAL3 = altcoins − ETH; X.D = X ÷ TOTAL × 100.
 * OTHERS não sai daqui (precisa das 10 maiores de cada dia): vem do histórico guardado.
 */
export function buildAggregates(input: AggregateInput): Partial<Record<MarketId, Pt[]>> {
  const btc = byDay(input.btc);
  const eth = byDay(input.eth);
  const usdt = byDay(input.usdt);
  const usdc = byDay(input.usdc);
  const st = byDay(input.stables);
  const out: Partial<Record<MarketId, Pt[]>> = { TOTAL: [], TOTAL2: [], TOTAL3: [], "BTC.D": [], "ETH.D": [], "USDT.D": [], "USDC.D": [], "STABLE.D": [] };
  const push = (id: MarketId, t: number, v: number) => Number.isFinite(v) && out[id]!.push([t, v]);
  for (const [t0, alt] of [...input.alt].sort((a, b) => a[0] - b[0])) {
    const t = dayStart(t0);
    if (!(alt > 0)) continue;
    push("TOTAL2", t, alt);
    const b = btc.get(t);
    if (b === undefined || !(b > 0)) continue;
    const total = alt + b;
    push("TOTAL", t, total);
    push("BTC.D", t, (b / total) * 100);
    const e = eth.get(t);
    if (e !== undefined && e > 0 && e < alt) {
      push("TOTAL3", t, alt - e);
      push("ETH.D", t, (e / total) * 100);
    }
    const ut = usdt.get(t);
    if (ut !== undefined && ut > 0) push("USDT.D", t, (ut / total) * 100);
    const uc = usdc.get(t);
    if (uc !== undefined && uc > 0) push("USDC.D", t, (uc / total) * 100);
    const s = st.get(t);
    if (s !== undefined && s > 0) push("STABLE.D", t, (s / total) * 100);
  }
  return out;
}

/** Junta séries por dia: a segunda vence nos dias em comum (ex.: histórico guardado + série recalculada). */
export function mergeDaily(base: Pt[], over: Pt[]): Pt[] {
  const m = new Map(base.map(([t, v]) => [dayStart(t), v]));
  for (const [t, v] of over) m.set(dayStart(t), v);
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

/** Último valor até o instante (sem interpolar); null se não houver. */
export function valueAt(points: Pt[], t: number): number | null {
  let lo = 0;
  let hi = points.length - 1;
  let found: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= t) {
      found = points[mid][1];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * Variação no período: valor atual contra o valor de `days` dias antes (o último até essa data).
 * "pct" = variação percentual; "pp" = diferença em pontos (dominâncias). null sem dado suficiente
 * (o ponto inicial precisa existir e não pode ser mais de 3 dias anterior à data pedida).
 */
export function changeOver(points: Pt[], days: number, kind: "pct" | "pp"): number | null {
  if (points.length < 2) return null;
  const [tEnd, end] = points[points.length - 1];
  const target = tEnd - days * DAY;
  let i = -1;
  for (let lo = 0, hi = points.length - 1; lo <= hi; ) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= target + DAY / 2) {
      i = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (i < 0 || i === points.length - 1 || target - points[i][0] > 3 * DAY) return null;
  const start = points[i][1];
  if (kind === "pp") return end - start;
  return start === 0 ? null : ((end - start) / Math.abs(start)) * 100;
}

/** Pontos a partir de `days` dias antes do último (janela de visualização). */
export function windowOf(points: Pt[], days: number): Pt[] {
  if (!points.length) return points;
  const from = points[points.length - 1][0] - days * DAY;
  return points.filter(([t]) => t >= from);
}

// ---------- Top 100 ----------

export type CoinRow = {
  id: number;
  rank: number;
  name: string;
  symbol: string;
  marketCap: number;
  price: number;
  tags: string[];
  change: { "1D": number | null; "7D": number | null; "30D": number | null; "90D": number | null };
};
export type PerfPeriod = keyof CoinRow["change"];
export const PERF_PERIODS: PerfPeriod[] = ["1D", "7D", "30D", "90D"];

/** Fora do ranking: stablecoins e ouro tokenizado (preço atrelado, não desempenho). */
const EXCLUDED_TAGS = ["stablecoin", "tokenized-gold", "tokenized-commodities", "fiat-stablecoin"];
export const isEligible = (c: CoinRow) => !c.tags.some((t) => EXCLUDED_TAGS.includes(t));

/** As `n` maiores elegíveis por capitalização (a ordem da CoinMarketCap). */
export function topEligible(coins: CoinRow[], n = 100): CoinRow[] {
  return coins
    .filter(isEligible)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, n);
}

export type Breadth = { up: number; down: number; mean: number | null; median: number | null; beatBtc: number | null; total: number; btc: number | null };

/** Amplitude do período: altas, quedas, média, mediana e % de altcoins acima do BTC (só ativos com variação). */
export function breadth(coins: CoinRow[], period: PerfPeriod): Breadth {
  const vals = coins.map((c) => c.change[period]).filter((v): v is number => v !== null && Number.isFinite(v));
  const btc = coins.find((c) => c.symbol === "BTC")?.change[period] ?? null;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = !sorted.length ? null : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const alts = coins.filter((c) => c.symbol !== "BTC" && c.change[period] !== null);
  const beat = btc === null || !alts.length ? null : (alts.filter((c) => (c.change[period] as number) > btc).length / alts.length) * 100;
  return {
    up: vals.filter((v) => v > 0).length,
    down: vals.filter((v) => v < 0).length,
    mean: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null,
    median,
    beatBtc: beat,
    total: vals.length,
    btc,
  };
}

/** Capitalização fora das 10 maiores (todas as moedas listadas, como o OTHERS do TradingView). */
export function othersCap(total: number, coins: CoinRow[]): number | null {
  const top10 = [...coins].sort((a, b) => a.rank - b.rank).slice(0, 10);
  if (top10.length < 10 || !(total > 0)) return null;
  const v = total - top10.reduce((s, c) => s + c.marketCap, 0);
  return v > 0 ? v : null;
}

// ---------- Altseason ----------

/** Faixas da CoinMarketCap: ≥ 75 = Altcoin Season; ≤ 25 = Bitcoin Season; no meio, sem temporada definida. */
export function seasonOf(index: number): "Altcoin Season" | "Bitcoin Season" | "Neutro" {
  if (index >= 75) return "Altcoin Season";
  if (index <= 25) return "Bitcoin Season";
  return "Neutro";
}
