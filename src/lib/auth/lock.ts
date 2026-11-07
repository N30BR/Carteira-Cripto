// Bloqueio por inatividade (validado no servidor).
//
// Cada sessão guarda a última interação REAL da pessoa (lastActiveAt). O navegador só avisa o servidor quando há
// mouse, teclado, rolagem ou toque (heartbeat a cada poucos segundos de uso); atualizações automáticas de gráficos
// e APIs NÃO renovam. Passado o tempo escolhido (+ uma folga do intervalo de aviso), a sessão fica bloqueada: o
// servidor não devolve nenhum dado privado (páginas, APIs, actions) até a pessoa desbloquear com a senha.
// O timer do navegador só mostra a tela de bloqueio antes; quem decide é o servidor.
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { hashToken, type SessionUser } from "./sessions";

import { DEFAULT_LOCK_MINUTES, graceMs, isLockMinutes, type LockMinutes } from "./lock-config";
export { DEFAULT_LOCK_MINUTES, LOCK_OPTIONS, graceMs, heartbeatMs, isLockMinutes, type LockMinutes } from "./lock-config";

export function isIdleLocked(lastActiveAt: Date | null, minutes: number, now: Date): boolean {
  // Sessões antigas (sem registro): contam como ativas agora e passam a ser registradas no próximo aviso.
  if (!lastActiveAt) return false;
  const m = isLockMinutes(minutes) ? minutes : DEFAULT_LOCK_MINUTES;
  return now.getTime() - lastActiveAt.getTime() > m * 60_000 + graceMs(m);
}

export type SessionState = { user: SessionUser; locked: boolean; lockMinutes: LockMinutes; lastActiveAt: number | null; expiresAt: number };

/** Sessão do token: usuário, se está bloqueada por inatividade e o tempo escolhido. null = sem sessão (ou vencida). */
export function sessionState(db: Db, token: string, now = new Date()): SessionState | null {
  const idHash = hashToken(token);
  const row = db
    .select({
      expiresAt: sessions.expiresAt,
      lastActiveAt: sessions.lastActiveAt,
      id: users.id,
      username: users.username,
      isAdmin: users.isAdmin,
      lockMinutes: users.lockMinutes,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.idHash, idHash))
    .get();
  if (!row) return null;
  if (row.expiresAt.getTime() <= now.getTime()) {
    db.delete(sessions).where(eq(sessions.idHash, idHash)).run();
    return null;
  }
  const lockMinutes = isLockMinutes(row.lockMinutes) ? row.lockMinutes : DEFAULT_LOCK_MINUTES;
  // Sessão de antes desta versão (sem registro de atividade): começa a contar agora.
  if (!row.lastActiveAt) {
    db.update(sessions).set({ lastActiveAt: now }).where(eq(sessions.idHash, idHash)).run();
    row.lastActiveAt = now;
  }
  return {
    user: { id: row.id, username: row.username, isAdmin: row.isAdmin, sessionHash: idHash },
    locked: isIdleLocked(row.lastActiveAt, lockMinutes, now),
    lockMinutes,
    lastActiveAt: row.lastActiveAt?.getTime() ?? null,
    expiresAt: row.expiresAt.getTime(),
  };
}

/** Registra atividade real. Nunca desbloqueia: sessão já bloqueada exige a senha (ver unlockSession). */
export function touchSession(db: Db, token: string, now = new Date()): { ok: true } | { ok: false; locked: boolean } {
  const s = sessionState(db, token, now);
  if (!s) return { ok: false, locked: false };
  if (s.locked) return { ok: false, locked: true };
  db.update(sessions).set({ lastActiveAt: now }).where(eq(sessions.idHash, s.user.sessionHash)).run();
  return { ok: true };
}

/** Desbloqueio (depois de conferir a senha): a sessão volta a valer a partir de agora. */
export function unlockSession(db: Db, sessionHash: string, userId: number, now = new Date()): void {
  db.update(sessions)
    .set({ lastActiveAt: now })
    .where(and(eq(sessions.idHash, sessionHash), eq(sessions.userId, userId)))
    .run();
}

export function setLockMinutes(db: Db, userId: number, minutes: unknown): boolean {
  if (!isLockMinutes(minutes)) return false;
  db.update(users).set({ lockMinutes: minutes }).where(eq(users.id, userId)).run();
  return true;
}
