// Desbloqueio de uma sessão bloqueada por inatividade: confere a senha da própria conta da sessão.
// Mesmas proteções do login (uma verificação por vez, limite por IP, contador da conta) e, além disso,
// 5 senhas erradas na mesma sessão encerram a sessão (passa a exigir o login completo).
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { users } from "@/db/schema";
import { createWindowLimiter } from "@/lib/rate-limit";
import { ipLimited, recordIpFailure } from "./ip-limit";
import { sessionState, unlockSession } from "./lock";
import { recordFailure, serializeAuth } from "./login";
import { verifyPassword } from "./password";
import { deleteSession } from "./sessions";

export const UNLOCK_MAX_FAILURES = 5;
const perSession = createWindowLimiter(UNLOCK_MAX_FAILURES, 15 * 60_000);

export type UnlockResult = { ok: true } | { ok: false; reason: "expired" | "invalid" | "ip" };

export function attemptUnlock(db: Db, token: string, password: string, now = new Date(), ip: string | null = null): Promise<UnlockResult> {
  return serializeAuth(async () => {
    if (ipLimited(ip, now)) return { ok: false, reason: "ip" } as const;
    const s = sessionState(db, token, now);
    if (!s) return { ok: false, reason: "expired" } as const;
    const row = db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, s.user.id)).get();
    if (!row || !(await verifyPassword(row.passwordHash, String(password ?? "")))) {
      recordIpFailure(ip, now);
      recordFailure(db, s.user.id, now);
      perSession.hit(s.user.sessionHash, now);
      if (perSession.limited(s.user.sessionHash, now)) {
        perSession.clear(s.user.sessionHash);
        deleteSession(db, token);
        return { ok: false, reason: "expired" } as const;
      }
      return { ok: false, reason: "invalid" } as const;
    }
    perSession.clear(s.user.sessionHash);
    unlockSession(db, s.user.sessionHash, s.user.id, now);
    return { ok: true } as const;
  });
}

/** Só para testes. */
export function resetUnlockLimits(): void {
  perSession.reset();
}
