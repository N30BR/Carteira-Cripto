import type { Db } from "@/db/client";
import { MINOR_UNITS, pickCurrency, type RefCurrency } from "@/lib/currency";
import { resolveCurrency } from "@/lib/currency-view";

export { MINOR_UNITS };

export type BrlDisplay = {
  /** Moeda efetivamente usada (BRL se faltar cotação para a pedida). */
  currency: RefCurrency;
  /** Moeda pedida (para manter nos links). */
  requested: RefCurrency;
  /** Centavos de real → unidades mínimas da moeda escolhida, pela cotação atual. */
  convert: (brlCents: number) => number;
  warning: string | null;
  /** Cotação vinda do cache antigo (Binance fora do ar): desde quando. */
  staleSince: Date | null;
};

/**
 * Prepara a exibição de valores guardados em reais (faturas, transações) na moeda escolhida
 * (?moeda= ou cookie; padrão BRL), com as cotações da aba Cripto (Binance).
 */
export async function brlDisplay(db: Db, param: unknown, cookie: unknown, now = new Date()): Promise<BrlDisplay> {
  const requested = pickCurrency(param, cookie, "BRL");
  const view = await resolveCurrency(db, "BRL", requested, "BRL", now);
  const scale = MINOR_UNITS[view.currency];
  return {
    currency: view.currency,
    requested,
    // Em BRL não há conversão: os centavos ficam exatos.
    convert: view.currency === "BRL" ? (cents) => cents : (cents) => (cents * view.factorNow * scale) / 100,
    warning: view.warning,
    staleSince: view.staleSince,
  };
}

/** Aviso para quando a cotação usada veio do cache antigo (Binance fora do ar). */
export function staleRateWarning(staleSince: Date | null, timeZone: string): string | null {
  if (!staleSince) return null;
  const when = new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(staleSince);
  return `Cotação de ${when} (desatualizada): a Binance não respondeu.`;
}
