import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { users } from "@/db/schema";
import { normalizeUsername } from "@/lib/validation";
import { ipLimited, recordIpFailure } from "./ip-limit";
import { DUMMY_HASH, verifyPassword } from "./password";
import { createSession } from "./sessions";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MS = 15 * 60 * 1000;

let queue: Promise<unknown> = Promise.resolve();

/**
 * Executa as verificações de senha uma de cada vez. Sem isso, requisições simultâneas
 * passariam todas pela checagem de bloqueio antes de qualquer falha ser registrada.
 * Funciona porque o app roda com uma única réplica.
 */
export function serializeAuth<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

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

export type LoginResult = { ok: true; token: string; expiresAt: Date } | { ok: false; reason: "invalid" | "ip" };

export function attemptLogin(
  db: Db,
  username: string,
  password: string,
  now = new Date(),
  ip: string | null = null,
): Promise<LoginResult> {
  return serializeAuth(async () => {
    if (ipLimited(ip, now)) return { ok: false, reason: "ip" } as const;

    const user = db.select().from(users).where(eq(users.username, normalizeUsername(username))).get();
    const fail = () => {
      recordIpFailure(ip, now);
      return { ok: false, reason: "invalid" } as const;
    };

    // Usuário inexistente ou bloqueado: roda o argon2 mesmo assim, para levar o mesmo tempo.
    if (!user || isLocked(user.lockedUntil, now)) {
      await verifyPassword(await DUMMY_HASH, password);
      return fail();
    }
    if (!(await verifyPassword(user.passwordHash, password))) {
      recordFailure(db, user.id, now);
      return fail();
    }

    db.update(users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id)).run();
    const { token, expiresAt } = createSession(db, user.id, now);
    return { ok: true, token, expiresAt } as const;
  });
}
