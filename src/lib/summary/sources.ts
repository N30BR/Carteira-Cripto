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
  asOf: Date | null;
  empty: boolean;
  reason: string | null;
};

/** Saldo cripto atual (mesmo cálculo da aba Cripto, em USDT) convertido pela cotação USDT/BRL da Binance. */
export async function cryptoBalanceBrl(db: Db, userId: number, now = new Date()): Promise<CryptoBalance> {
  const holdings = listHoldings(db, userId);
  if (!holdings.length) return { cents: 0, usdt: 0, usdtBrl: null, asOf: null, empty: true, reason: null };
  const [current, rates] = await Promise.all([
    getCurrentPrices(
      db,
      holdings.map((h) => h.coinId),
      now,
    ),
    getRates(db, now),
  ]);
  const usdt = computePortfolio(holdings, current.prices).total;
  if (usdt === null) return { cents: null, usdt: null, usdtBrl: null, asOf: current.fetchedAt, empty: false, reason: "Preços indisponíveis" };
  const f = factor("USDT", "BRL", rates);
  if (f === null) {
    return { cents: null, usdt, usdtBrl: null, asOf: current.fetchedAt, empty: false, reason: "Cotação USDT/BRL indisponível" };
  }
  return { cents: Math.round(usdt * f * 100), usdt, usdtBrl: f, asOf: current.fetchedAt, empty: false, reason: null };
}

/** Soma dos saldos mais recentes das contas em reais e a data do saldo mais recente. */
export function fiatBalanceBrl(db: Db, userId: number, today: string): { cents: number; asOf: string | null; empty: boolean } {
  const accounts = listAccounts(db, userId);
  if (!accounts.length) return { cents: 0, asOf: null, empty: true };
  const { total } = computeFiat(accounts, listBalances(db, userId), today);
  const asOf = accounts.map((a) => a.date).sort().at(-1) ?? null;
  return { cents: Math.round(total * 100), asOf, empty: false };
}
