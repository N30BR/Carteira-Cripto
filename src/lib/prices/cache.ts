import { and, eq, like, lt } from "drizzle-orm";
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

/** Lê do cache; se expirou, chama o loader. Se o loader falhar, devolve o valor antigo marcado como `stale`. */
export async function cached<T>(
  db: Db,
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  now = new Date(),
): Promise<Cached<T> | null> {
  const hit = readCache<T>(db, key, now);
  if (hit && !hit.stale) return hit;
  try {
    const data = await loader();
    writeCache(db, key, data, ttlMs, now);
    return { data, fetchedAt: now, stale: false };
  } catch {
    return hit;
  }
}

export function pruneExpired(db: Db, prefix: string, now = new Date()): void {
  db.delete(priceCache)
    .where(and(like(priceCache.key, `${prefix}%`), lt(priceCache.expiresAt, now)))
    .run();
}
