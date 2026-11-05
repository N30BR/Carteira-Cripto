import type { Db } from "@/db/client";
import { factor } from "@/lib/currency";
import { listAccounts, listBalances } from "@/lib/fiat/accounts";
import { computeFiat } from "@/lib/fiat/calc";
import { listHoldings } from "@/lib/holdings/holdings";
import { computePortfolio } from "@/lib/portfolio/calc";
import { getCurrentPrices } from "@/lib/prices";
import { getRates } from "@/lib/prices/rates";

export type CryptoBalance = {
  /** Saldo em centavos de real; null sem preço ou sem cotação USDT/BRL. */
  cents: number | null;
  usdt: number | null;
  /** Cotação USDT → BRL usada (Binance). */
  usdtBrl: number | null;
  /** Horário mais antigo entre os preços e a cotação usados. */
  asOf: Date | null;
  /** Binance indisponível: valores vieram do cache antigo. */
  stale: boolean;
  empty: boolean;
  reason: string | null;
};

const oldest = (...dates: (Date | null)[]) =>
  dates.filter((d): d is Date => d instanceof Date).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

/** Saldo cripto atual (mesmo cálculo da aba Cripto, em USDT) convertido pela cotação USDT/BRL da Binance. */
export async function cryptoBalanceBrl(db: Db, userId: number, now = new Date()): Promise<CryptoBalance> {
  const holdings = listHoldings(db, userId);
  if (!holdings.length) return { cents: 0, usdt: 0, usdtBrl: null, asOf: null, stale: false, empty: true, reason: null };
  const [current, rates] = await Promise.all([
    getCurrentPrices(
      db,
      holdings.map((h) => h.coinId),
      now,
    ),
    getRates(db, now),
  ]);
  const asOf = oldest(current.fetchedAt, rates.fetchedAt);
  const stale = current.stale || rates.stale;
  const usdt = computePortfolio(holdings, current.prices).total;
  if (usdt === null) return { cents: null, usdt: null, usdtBrl: null, asOf, stale, empty: false, reason: "Preços indisponíveis" };
  const f = factor("USDT", "BRL", rates);
  if (f === null) {
    return { cents: null, usdt, usdtBrl: null, asOf, stale, empty: false, reason: "Cotação USDT/BRL indisponível" };
  }
  return { cents: Math.round(usdt * f * 100), usdt, usdtBrl: f, asOf, stale, empty: false, reason: null };
}

/**
 * Soma dos saldos atuais das contas em reais. Datas: a do saldo mais antigo e a do mais recente
 * entre os usados (o total mistura contas atualizadas em dias diferentes).
 */
export function fiatBalanceBrl(
  db: Db,
  userId: number,
  today: string,
): { cents: number; oldest: string | null; newest: string | null; empty: boolean } {
  const accounts = listAccounts(db, userId);
  if (!accounts.length) return { cents: 0, oldest: null, newest: null, empty: true };
  const { total } = computeFiat(accounts, listBalances(db, userId), today);
  const dates = accounts.map((a) => a.date).sort();
  return { cents: Math.round(total * 100), oldest: dates[0], newest: dates.at(-1)!, empty: false };
}
