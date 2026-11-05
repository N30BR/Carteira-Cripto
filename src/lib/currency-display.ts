import type { Db } from "@/db/client";
import { pickCurrency, type RefCurrency } from "@/lib/currency";
import { resolveCurrency } from "@/lib/currency-view";

/** Unidades mínimas por moeda: centavos (BRL, USDT) e satoshis (BTC). */
export const MINOR_UNITS: Record<RefCurrency, number> = { BRL: 100, USDT: 100, BTC: 100_000_000 };

export type BrlDisplay = {
  /** Moeda efetivamente usada (BRL se faltar cotação para a pedida). */
  currency: RefCurrency;
  /** Moeda pedida (para manter nos links). */
  requested: RefCurrency;
  /** Centavos de real → unidades mínimas da moeda escolhida, pela cotação atual. */
  convert: (brlCents: number) => number;
  warning: string | null;
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
    convert: (cents) => (cents / 100) * view.factorNow * scale,
    warning: view.warning,
  };
}
