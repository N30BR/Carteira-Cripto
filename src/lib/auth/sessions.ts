import { createHash, randomBytes } from "node:crypto";
import { and, eq, lte, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { sessions, users } from "@/db/schema";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SessionUser = { id: number; username: string; isAdmin: boolean; sessionHash: string };

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSession(db: Db, userId: number, now = new Date()): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  // Aproveita para limpar sessões vencidas que nunca voltaram a ser usadas.
  db.delete(sessions).where(lte(sessions.expiresAt, now)).run();
  db.insert(sessions).values({ idHash: hashToken(token), userId, expiresAt }).run();
  return { token, expiresAt };
}

export function validateSession(db: Db, token: string, now = new Date()): SessionUser | null {
  const idHash = hashToken(token);
  const row = db
    .select({ expiresAt: sessions.expiresAt, id: users.id, username: users.username, isAdmin: users.isAdmin })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.idHash, idHash))
    .get();
  if (!row) return null;
  if (row.expiresAt.getTime() <= now.getTime()) {
    db.delete(sessions).where(eq(sessions.idHash, idHash)).run();
    return null;
  }
  return { id: row.id, username: row.username, isAdmin: row.isAdmin, sessionHash: idHash };
}

export function deleteSession(db: Db, token: string): void {
  db.delete(sessions).where(eq(sessions.idHash, hashToken(token))).run();
}

export function deleteUserSessions(db: Db, userId: number, exceptHash?: string): void {
  const where = exceptHash
    ? and(eq(sessions.userId, userId), ne(sessions.idHash, exceptHash))
    : eq(sessions.userId, userId);
  db.delete(sessions).where(where).run();
}
