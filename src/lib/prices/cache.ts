import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { priceCache } from "@/db/schema";

export type Cached<T> = { data: T; fetchedAt: Date; stale: boolean };

export function readCache<T>(db: Db, key: string, now = new Date()): Cached<T> | null {
  const row = db.select().from(priceCache).where(eq(priceCache.key, key)).get();
  if (!row) return null;
  return { data: JSON.parse(row.payload) as T, fetchedAt: row.fetchedAt, stale: row.expiresAt.getTime() <= now.getTime() };
}

export function writeCache<T>(db: Db, key: string, data: T, ttlMs: number, now = new Date()): void {
  const values = { payload: JSON.stringify(data), fetchedAt: now, expiresAt: new Date(now.getTime() + ttlMs) };
  db.insert(priceCache)
    .values({ key, ...values })
    .onConflictDoUpdate({ target: priceCache.key, set: values })
    .run();
}

// Buscas em andamento por banco e chave: quem chega enquanto uma busca roda espera a mesma resposta
// (várias páginas abertas quando o cache vence não multiplicam as chamadas à Binance).
const inFlight = new WeakMap<Db, Map<string, Promise<unknown>>>();

/** Lê do cache; se expirou, chama o loader. Se o loader falhar, devolve o valor antigo marcado como `stale`. */
export function cached<T>(
  db: Db,
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  now = new Date(),
): Promise<Cached<T> | null> {
  const hit = readCache<T>(db, key, now);
  if (hit && !hit.stale) return Promise.resolve(hit);
  let running = inFlight.get(db);
  if (!running) inFlight.set(db, (running = new Map()));
  const pending = running.get(key) as Promise<Cached<T> | null> | undefined;
  if (pending) return pending;
  const job = refresh(db, key, ttlMs, loader, now, hit).finally(() => running.delete(key));
  running.set(key, job);
  return job;
}

async function refresh<T>(
  db: Db,
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  now: Date,
  hit: Cached<T> | null,
): Promise<Cached<T> | null> {
  try {
    const data = await loader();
    writeCache(db, key, data, ttlMs, now);
    return { data, fetchedAt: now, stale: false };
  } catch {
    return hit;
  }
}

