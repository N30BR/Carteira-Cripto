import type { Db } from "@/db/client";
import { factor, ratesAt, type BaseCurrency, type RefCurrency } from "@/lib/currency";
import { getRateHistory, getRates } from "@/lib/prices/rates";

const DAY = 86_400_000;

export type CurrencyView = {
  /** Moeda efetivamente usada (pode ser a padrão, se faltar cotação). */
  currency: RefCurrency;
  /** Fator da moeda base para a escolhida, agora. */
  factorNow: number;
  /** Fator num instante passado (cotação da época; sem histórico, a atual). */
  factorAt: (t: number) => number;
  /** Converte uma curva ponto a ponto; o último ponto usa a cotação atual. */
  convertPoints: (points: { t: number; value: number }[]) => { t: number; value: number }[];
  warning: string | null;
  staleSince: Date | null;
};

function identity(currency: RefCurrency, warning: string | null = null): CurrencyView {
  return { currency, factorNow: 1, factorAt: () => 1, convertPoints: (p) => p, warning, staleSince: null };
}

/**
 * Prepara a conversão dos valores de um dashboard (guardados em `base`) para a moeda pedida.
 * Sem cotação disponível, volta para `fallback` com um aviso.
 */
export async function resolveCurrency(
  db: Db,
  base: BaseCurrency,
  requested: RefCurrency,
  fallback: RefCurrency,
  now = new Date(),
): Promise<CurrencyView> {
  if (requested === base) return identity(base);

  const [rates, h30, h1000] = await Promise.all([
    getRates(db, now),
    getRateHistory(db, 30, now),
    getRateHistory(db, 1000, now),
  ]);
  const fNow = factor(base, requested, rates);
  if (fNow === null) {
    const warning = `Cotação de ${requested} indisponível no momento, mostrando em ${fallback}.`;
    if (fallback === base) return identity(base, warning);
    return { ...(await resolveCurrency(db, base, fallback, base, now)), warning };
  }

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
    factorAt,
    convertPoints: (points) =>
      points.map((p, i) => ({ t: p.t, value: p.value * (i === points.length - 1 ? fNow : factorAt(p.t)) })),
    warning: null,
    staleSince: staleDates.length ? new Date(Math.min(...staleDates.map((d) => d.getTime()))) : null,
  };
}
