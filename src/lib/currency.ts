import type { PricePoint } from "@/lib/portfolio/calc";
import type { RateHistory, Rates } from "@/lib/prices/rates";

export type RefCurrency = "USDT" | "BTC" | "BRL";
export const CURRENCIES: RefCurrency[] = ["USDT", "BTC", "BRL"];
/** Moeda em que os valores estão guardados: cripto em USDT, contas em BRL. */
export type BaseCurrency = "USDT" | "BRL";

export function parseCurrency(raw: unknown, fallback: RefCurrency): RefCurrency {
  const s = typeof raw === "string" ? raw.toUpperCase() : "";
  return (CURRENCIES as string[]).includes(s) ? (s as RefCurrency) : fallback;
}

/** Quanto vale 1 unidade de `base` em `cur`; null quando falta a cotação necessária. */
export function factor(base: BaseCurrency, cur: RefCurrency, rates: Rates): number | null {
  if (base === cur) return 1;
  const brl = rates.usdtBrl && rates.usdtBrl > 0 ? rates.usdtBrl : null;
  const btc = rates.btcUsdt && rates.btcUsdt > 0 ? rates.btcUsdt : null;
  // Tudo passa por USDT: 1 base → x USDT → cur.
  const toUsdt = base === "USDT" ? 1 : brl ? 1 / brl : null;
  if (toUsdt === null) return null;
  if (cur === "USDT") return toUsdt;
  if (cur === "BRL") return brl ? toUsdt * brl : null;
  return btc ? toUsdt / btc : null;
}

/** Última cotação com horário ≤ t; antes do histórico, a mais antiga; sem histórico, null. */
export function rateAt(points: PricePoint[], t: number): number | null {
  if (!points.length) return null;
  let best: PricePoint | null = null;
  for (const p of points) if (p[0] <= t && (!best || p[0] >= best[0])) best = p;
  if (best) return best[1];
  return points.reduce((a, b) => (b[0] < a[0] ? b : a))[1];
}

export function ratesAt(history: RateHistory, t: number): Rates {
  return { usdtBrl: rateAt(history.usdtBrl, t), btcUsdt: rateAt(history.btcUsdt, t) };
}

/** Converte a curva ponto a ponto pela cotação da época; o último ponto (agora) usa a cotação atual. */
export function convertCurve(
  points: { t: number; value: number }[],
  base: BaseCurrency,
  cur: RefCurrency,
  history: RateHistory,
  current: Rates,
): { t: number; value: number }[] {
  if (base === cur) return points;
  const now = factor(base, cur, current);
  return points.map((p, i) => {
    const f = i === points.length - 1 ? now : (factor(base, cur, ratesAt(history, p.t)) ?? now);
    return { t: p.t, value: f === null ? p.value : p.value * f };
  });
}

/** Variação % convertida para a moeda de referência: (1 + v) × fator_agora / fator_antes − 1. */
export function adjustChange(pct: number | null, fNow: number | null, fPast: number | null): number | null {
  if (pct === null || fNow === null || fPast === null || fPast <= 0) return null;
  return ((1 + pct / 100) * (fNow / fPast) - 1) * 100;
}

const two = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eight = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 8, maximumFractionDigits: 8 });
const sig = new Intl.NumberFormat("pt-BR", { maximumSignificantDigits: 4 });
const PREFIX: Record<RefCurrency, string> = { USDT: "US$", BRL: "R$", BTC: "₿" };

function withSign(n: number, body: string): string {
  return n < 0 ? `-${body}` : body;
}

export function formatMoney(n: number, cur: RefCurrency): string {
  const f = cur === "BTC" ? eight : two;
  return withSign(n, `${PREFIX[cur]} ${f.format(Math.abs(n))}`);
}

/** Preço unitário: em US$/R$ abaixo de 1 mostra até 4 dígitos significativos; em BTC, 8 casas. */
export function formatMoneyPrice(n: number, cur: RefCurrency): string {
  const a = Math.abs(n);
  if (cur === "BTC") return a > 0 && a < 1e-8 ? "< ₿ 0,00000001" : formatMoney(n, cur);
  if (a >= 1 || a === 0) return formatMoney(n, cur);
  const [int, dec = ""] = sig.format(a).split(",");
  return withSign(n, `${PREFIX[cur]} ${int},${dec.padEnd(2, "0")}`);
}
