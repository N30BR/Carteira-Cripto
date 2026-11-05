import type { Db } from "@/db/client";
import { factor, ratesAt, type BaseCurrency, type RefCurrency } from "@/lib/currency";
import type { CurrentPrice } from "@/lib/portfolio/calc";
import { getRateHistory, getRates } from "@/lib/prices/rates";

const DAY = 86_400_000;

export type CurrencyView = {
  /** Moeda efetivamente usada (pode ser a padrão, se faltar cotação). */
  currency: RefCurrency;
  /** Fator da moeda base para a escolhida, agora. */
  factorNow: number;
  /** Fator de 24h atrás, pela variação 24h dos tickers (mesma base da variação 24h dos preços). */
  factor24hAgo: number;
  /** Fator num instante passado (cotação da época; sem histórico, a atual). */
  factorAt: (t: number) => number;
  /** Converte uma curva ponto a ponto; o último ponto usa a cotação atual. */
  convertPoints: (points: { t: number; value: number }[]) => { t: number; value: number }[];
  warning: string | null;
  staleSince: Date | null;
};

function identity(currency: RefCurrency, warning: string | null = null): CurrencyView {
  return { currency, factorNow: 1, factor24hAgo: 1, factorAt: () => 1, convertPoints: (p) => p, warning, staleSince: null };
}

/**
 * Prepara a conversão dos valores de um dashboard (guardados em `base`) para a moeda pedida.
 * Sem cotação disponível, volta para `fallback` com um aviso.
 * `opts.btcUsdt`: preço do BTC já usado na carteira, para o BTC valer exatamente ₿ 1 quando a referência é BTC.
 */
export async function resolveCurrency(
  db: Db,
  base: BaseCurrency,
  requested: RefCurrency,
  fallback: RefCurrency,
  now = new Date(),
  opts: { btcUsdt?: CurrentPrice; historyDays?: 365 | 1000 } = {},
): Promise<CurrencyView> {
  if (requested === base) return identity(base);

  const [fetched, h30, h1000] = await Promise.all([
    getRates(db, now),
    getRateHistory(db, 30, now),
    getRateHistory(db, opts.historyDays ?? 1000, now),
  ]);
  const rates = opts.btcUsdt
    ? { ...fetched, btcUsdt: opts.btcUsdt.usd, btcUsdtChange24h: opts.btcUsdt.change24h }
    : fetched;
  const fNow = factor(base, requested, rates);
  if (fNow === null) {
    const warning = `Cotação de ${requested} indisponível no momento, mostrando em ${fallback}.`;
    if (fallback === base) return identity(base, warning);
    return { ...(await resolveCurrency(db, base, fallback, base, now, opts)), warning };
  }

  const before = (price: number | null, change: number | null) =>
    price !== null && change !== null && change > -100 ? price / (1 + change / 100) : price;
  const f24 =
    factor(base, requested, {
      usdtBrl: before(rates.usdtBrl, rates.usdtBrlChange24h),
      btcUsdt: before(rates.btcUsdt, rates.btcUsdtChange24h),
    }) ?? fNow;

  // Até 30 dias: velas de 1 hora; antes disso: diárias.
  const factorAt = (t: number) => {
    const history = now.getTime() - t <= 30 * DAY ? h30 : h1000;
    return factor(base, requested, ratesAt(history, t)) ?? fNow;
  };

  const staleDates = [
    rates.stale && rates.fetchedAt,
    h30.stale && h30.oldestFetchedAt,
    h1000.stale && h1000.oldestFetchedAt,
  ].filter((d): d is Date => d instanceof Date);

  return {
    currency: requested,
    factorNow: fNow,
    factor24hAgo: f24,
    factorAt,
    convertPoints: (points) =>
      points.map((p, i) => ({ t: p.t, value: p.value * (i === points.length - 1 ? fNow : factorAt(p.t)) })),
    warning: null,
    staleSince: staleDates.length ? new Date(Math.min(...staleDates.map((d) => d.getTime()))) : null,
  };
}
