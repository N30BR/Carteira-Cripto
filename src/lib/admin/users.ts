import { count, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { deleteUserSessions } from "@/lib/auth/sessions";
import { isLocked, recordFailure, serializeAuth } from "@/lib/auth/login";
import { clearUserPairs, pairLimited, recordPairFailure } from "@/lib/auth/ip-limit";
import { normalizeUsername, validatePassword, validateUsername } from "@/lib/validation";

export type Result = { ok: true } | { ok: false; error: string };

const fail = (error: string): Result => ({ ok: false, error });

export function listUsers(db: Db) {
  return db
    .select({
      id: users.id,
      username: users.username,
      isAdmin: users.isAdmin,
      createdAt: users.createdAt,
      lockedUntil: users.lockedUntil,
    })
    .from(users)
    .orderBy(users.username)
    .all();
}

export async function createUser(
  db: Db,
  input: { username: string; password: string; isAdmin: boolean },
): Promise<Result> {
  const username = normalizeUsername(input.username);
  const invalid = validateUsername(username) ?? validatePassword(input.password);
  if (invalid) return fail(invalid);
  // O hash vem antes: a checagem e o insert rodam juntos, sem await no meio,
  // então duas criações simultâneas do mesmo nome não passam as duas.
  const passwordHash = await hashPassword(input.password);
  if (db.select({ id: users.id }).from(users).where(eq(users.username, username)).get()) {
    return fail("Usuário já existe");
  }
  db.insert(users).values({ username, passwordHash, isAdmin: input.isAdmin, createdAt: new Date() }).run();
  return { ok: true };
}

export async function resetPassword(db: Db, userId: number, newPassword: string): Promise<Result> {
  const invalid = validatePassword(newPassword);
  if (invalid) return fail(invalid);
  const passwordHash = await hashPassword(newPassword);
  const r = db.update(users).set({ passwordHash, failedAttempts: 0, lockedUntil: null }).where(eq(users.id, userId)).run();
  clearUserPairs(userId);
  if (!r.changes) return fail("Usuário não encontrado");
  deleteUserSessions(db, userId);
  return { ok: true };
}

export function unlockUser(db: Db, userId: number): Result {
  const r = db.update(users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(users.id, userId)).run();
  clearUserPairs(userId);
  return r.changes ? { ok: true } : fail("Usuário não encontrado");
}

export function deleteUser(db: Db, actorId: number, targetId: number): Result {
  if (actorId === targetId) return fail("Você não pode remover a si mesmo");
  const target = db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, targetId)).get();
  if (!target) return fail("Usuário não encontrado");
  if (target.isAdmin) {
    const [{ n }] = db.select({ n: count() }).from(users).where(eq(users.isAdmin, true)).all();
    if (n <= 1) return fail("Não é possível remover o último administrador");
  }
  db.delete(users).where(eq(users.id, targetId)).run();
  return { ok: true };
}

export async function changeOwnPassword(
  db: Db,
  userId: number,
  currentHash: string,
  current: string,
  next: string,
  now = new Date(),
): Promise<Result> {
  const invalid = validatePassword(next);
  if (invalid) return fail(invalid);
  return serializeAuth(() => checkAndChange(db, userId, currentHash, current, next, now));
}

const CHANGE_KEY = "troca-de-senha";

async function checkAndChange(
  db: Db,
  userId: number,
  currentHash: string,
  current: string,
  next: string,
  now: Date,
): Promise<Result> {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return fail("Usuário não encontrado");
  // Troca da própria senha (já logado): 5 erros em 15 min bloqueiam a troca, além do bloqueio da conta.
  if (isLocked(user.lockedUntil, now) || pairLimited(userId, CHANGE_KEY, now)) {
    return fail("Muitas tentativas. Tente novamente em 15 minutos.");
  }
  if (!(await verifyPassword(user.passwordHash, current))) {
    recordFailure(db, userId, now);
    recordPairFailure(userId, CHANGE_KEY, now);
    return fail("Senha atual incorreta");
  }
  db.update(users)
    .set({ passwordHash: await hashPassword(next), failedAttempts: 0, lockedUntil: null })
    .where(eq(users.id, userId))
    .run();
  deleteUserSessions(db, userId, currentHash);
  return { ok: true };
}

/** Cria o primeiro admin a partir de ADMIN_USERNAME/ADMIN_PASSWORD quando não existe nenhum usuário. */
export async function ensureBootstrapAdmin(
  db: Db,
  env: Record<string, string | undefined> = process.env,
): Promise<"created" | "skipped"> {
  const { ADMIN_USERNAME, ADMIN_PASSWORD } = env;
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) return "skipped";
  const [{ n }] = db.select({ n: count() }).from(users).all();
  if (n > 0) return "skipped";
  const r = await createUser(db, { username: ADMIN_USERNAME, password: ADMIN_PASSWORD, isAdmin: true });
  if (!r.ok) {
    console.error(`Não foi possível criar o administrador inicial: ${r.error}`);
    return "skipped";
  }
  console.log(`Administrador inicial criado: ${normalizeUsername(ADMIN_USERNAME)}`);
  return "created";
}
