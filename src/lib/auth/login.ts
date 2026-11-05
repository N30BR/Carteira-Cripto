import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { users } from "@/db/schema";
import { normalizeUsername } from "@/lib/validation";
import { DUMMY_HASH, verifyPassword } from "./password";
import { createSession } from "./sessions";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MS = 15 * 60 * 1000;

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

export function recordFailure(db: Db, userId: number, now = new Date()): void {
  const user = db.select({ failedAttempts: users.failedAttempts }).from(users).where(eq(users.id, userId)).get();
  if (!user) return;
  const attempts = user.failedAttempts + 1;
  const update =
    attempts >= MAX_FAILED_ATTEMPTS
      ? { failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCK_MS) }
      : { failedAttempts: attempts };
  db.update(users).set(update).where(eq(users.id, userId)).run();
}

export async function attemptLogin(
  db: Db,
  username: string,
  password: string,
  now = new Date(),
): Promise<{ ok: true; token: string; expiresAt: Date } | { ok: false }> {
  const user = db.select().from(users).where(eq(users.username, normalizeUsername(username))).get();

  if (!user) {
    await verifyPassword(await DUMMY_HASH, password);
    return { ok: false };
  }
  if (isLocked(user.lockedUntil, now)) return { ok: false };

  if (!(await verifyPassword(user.passwordHash, password))) {
    recordFailure(db, user.id, now);
    return { ok: false };
  }

  db.update(users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id)).run();
  const { token, expiresAt } = createSession(db, user.id, now);
  return { ok: true, token, expiresAt };
}
