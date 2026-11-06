// Cota de pedidos às fontes on-chain gratuitas (contador no banco: sobrevive a reinícios do servidor).
// BGeometrics (sem chave): 10 pedidos/hora e 15/dia por servidor. Aqui usamos no máximo 8/hora e 12/dia,
// e o dia é dividido em 5 janelas (~4h48): cada série atualiza uma vez por dia, só na sua janela.
// Coin Metrics (cálculo próprio): a mesma cota diária, sem janelas.
import type { Db } from "@/db/client";
import { readCache, writeCache } from "@/lib/prices/cache";
import type { OnchainId } from "./onchain-ids";

export const BG_LIMITS = { perHour: 8, perDay: 12 };
export const WINDOWS = 5;
export type Source = "bgeometrics" | "coinmetrics";
const key = (src: Source) => `onchain:${src}:budget:v1`;
const DAY = 86_400_000;
const HOUR = 3_600_000;

const ORDER: OnchainId[] = ["SOPR", "STH_SOPR", "STH_REALIZED_PRICE", "RHODL", "RESERVE_RISK", "REALIZED_PRICE", "NUPL", "MVRV_Z", "PUELL"];
/** Janela de atualização de cada série da BGeometrics. */
export const bgSlot = (id: OnchainId) => Math.max(0, ORDER.indexOf(id)) % WINDOWS;
/** Janela atual (UTC). */
export const windowOf = (now: Date) => Math.floor((now.getTime() % DAY) / (DAY / WINDOWS));

type Budget = { day: number; hour: number; dayCount: number; hourCount: number };

function current(db: Db, src: Source, now: Date): Budget {
  const day = Math.floor(now.getTime() / DAY);
  const hour = Math.floor(now.getTime() / HOUR);
  const b = readCache<Budget>(db, key(src), now)?.data;
  return {
    day,
    hour,
    dayCount: b && b.day === day ? b.dayCount : 0,
    hourCount: b && b.hour === hour ? b.hourCount : 0,
  };
}

/**
 * Pode buscar agora? Precisa de cota e, se a série já tem dados guardados, estar na janela dela.
 * Série sem nenhum dado pode buscar fora da janela (primeira carga), se houver cota.
 */
export function budgetAllows(db: Db, slot: number | null, hasData: boolean, now = new Date(), src: Source = "bgeometrics"): boolean {
  const b = current(db, src, now);
  if (b.dayCount >= BG_LIMITS.perDay || b.hourCount >= BG_LIMITS.perHour) return false;
  return !hasData || slot === null || windowOf(now) === slot;
}

/** Registra um pedido feito à fonte. */
export function spendBudget(db: Db, now = new Date(), src: Source = "bgeometrics"): void {
  const b = current(db, src, now);
  writeCache(db, key(src), { ...b, dayCount: b.dayCount + 1, hourCount: b.hourCount + 1 }, 2 * DAY, now);
}

// ---------- falhas guardadas (sobrevivem a reinícios) ----------
type Failure = { count: number; at: number };
const failKey = (k: string) => `onchain:failure:${k}:v1`;

/**
 * Pode tentar de novo depois de falhas? 1ª falha: espera 1 h; 2ª: 4 h; da 3ª em diante, só na janela da série
 * (uma série que falha sempre não gasta a cota das outras).
 */
export function failureAllows(db: Db, key: string, slot: number | null, now = new Date()): boolean {
  const f = readCache<Failure>(db, failKey(key), now)?.data;
  if (!f || f.count <= 0) return true;
  const since = now.getTime() - f.at;
  if (f.count === 1) return since >= HOUR;
  if (f.count === 2) return since >= 4 * HOUR;
  return since >= 4 * HOUR && (slot === null || windowOf(now) === slot);
}

export function recordFailure(db: Db, key: string, now = new Date()): void {
  const f = readCache<Failure>(db, failKey(key), now)?.data;
  writeCache(db, failKey(key), { count: (f?.count ?? 0) + 1, at: now.getTime() }, 30 * DAY, now);
}

export function clearFailure(db: Db, key: string, now = new Date()): void {
  if (readCache<Failure>(db, failKey(key), now)?.data?.count) writeCache(db, failKey(key), { count: 0, at: now.getTime() }, DAY, now);
}
