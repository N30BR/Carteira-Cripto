import type { Db } from "@/db/client";
import { listAccounts, listBalances } from "@/lib/fiat/accounts";
import { computeFiat } from "@/lib/fiat/calc";
import { listHoldings } from "@/lib/holdings/holdings";
import { getCurrentPrices, getHistory } from "@/lib/prices";
import { portfolioValueAt } from "./window";

export type CryptoPeriod = {
  /** Saldo cripto total atual (USDT), com todas as moedas que têm preço; null sem preço. */
  nowUsdt: number | null;
  /** Valor da carteira (USDT) no início do período; null sem preço/histórico nessa data. */
  startUsdt: number | null;
  /** Valor no fim do período (ou agora, se o período ainda não acabou), com as mesmas moedas. */
  endUsdt: number | null;
  /** Fim usado na comparação (agora, se o período ainda não terminou). */
  endMs: number;
  /** Horário mais antigo entre os preços usados. */
  asOf: Date | null;
  /** Binance indisponível: valores vieram do cache antigo. */
  stale: boolean;
  empty: boolean;
  reason: string | null;
};

const DAY = 86_400_000;
const oldest = (...dates: (Date | null)[]) =>
  dates.filter((d): d is Date => d instanceof Date).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

/**
 * Carteira cripto no período: valor no início (quantidades atuais × preço da época) e no fim,
 * com as mesmas moedas nos dois lados. A diferença é a valorização/desvalorização do período.
 */
export async function cryptoPeriod(db: Db, userId: number, startMs: number, endMs: number, now = new Date()): Promise<CryptoPeriod> {
  const holdings = listHoldings(db, userId);
  const end = Math.min(endMs, now.getTime());
  if (!holdings.length) return { nowUsdt: 0, startUsdt: 0, endUsdt: 0, endMs: end, asOf: null, stale: false, empty: true, reason: null };

  const current = await getCurrentPrices(
    db,
    holdings.map((h) => h.coinId),
    now,
  );
  const priced = holdings.filter((h) => current.prices[h.coinId]).map((h) => h.coinId);
  if (!priced.length) {
    return { nowUsdt: null, startUsdt: null, endUsdt: null, endMs: end, asOf: current.fetchedAt, stale: current.stale, empty: false, reason: "Preços indisponíveis" };
  }
  const nowValue = holdings.filter((h) => priced.includes(h.coinId)).reduce((s, h) => s + Number(h.quantity) * current.prices[h.coinId].usd, 0);
  // Período que ainda não começou: vale o saldo de agora, sem variação.
  if (startMs >= now.getTime()) {
    return { nowUsdt: nowValue, startUsdt: nowValue, endUsdt: nowValue, endMs: now.getTime(), asOf: current.fetchedAt, stale: current.stale, empty: false, reason: null };
  }
  const age = now.getTime() - startMs;
  if (age > 365 * DAY) {
    return { nowUsdt: nowValue, startUsdt: null, endUsdt: null, endMs: end, asOf: current.fetchedAt, stale: current.stale, empty: false, reason: "Sem histórico de preços tão antigo" };
  }
  // Até 29 dias: velas de 1 hora; antes disso: diárias (mesmo histórico da aba Cripto).
  const hist = await getHistory(db, priced, age <= 29 * DAY ? "1M" : "1A", now);
  const coins = priced.filter((id) => (hist.history[id] ?? []).some(([t]) => t <= startMs));
  const asOf = oldest(current.fetchedAt, hist.oldestFetchedAt);
  const stale = current.stale || hist.stale;
  if (!coins.length) return { nowUsdt: nowValue, startUsdt: null, endUsdt: null, endMs: end, asOf, stale, empty: false, reason: "Sem preço no início do período" };
  const startUsdt = portfolioValueAt(holdings, hist.history, startMs, coins);
  const endUsdt =
    endMs >= now.getTime()
      ? holdings.filter((h) => coins.includes(h.coinId)).reduce((s, h) => s + Number(h.quantity) * current.prices[h.coinId].usd, 0)
      : portfolioValueAt(holdings, hist.history, endMs, coins);
  return { nowUsdt: nowValue, startUsdt, endUsdt, endMs: end, asOf, stale, empty: false, reason: null };
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
