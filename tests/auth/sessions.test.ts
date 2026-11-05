import { createHash } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";
import { testDb } from "../helpers/db";
import { sessions, users } from "@/db/schema";
import {
  SESSION_TTL_MS,
  createSession,
  deleteSession,
  deleteUserSessions,
  validateSession,
} from "@/lib/auth/sessions";
import { sessionCookieName, sessionCookieOptions } from "@/lib/auth/cookie";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function setup() {
  const db = testDb();
  const [u] = db
    .insert(users)
    .values({ username: "pedro", passwordHash: "x", isAdmin: true, createdAt: new Date() })
    .returning()
    .all();
  return { db, u };
}

describe("sessions", () => {
  test("token vai no cookie e só o hash fica no banco", () => {
    const { db, u } = setup();
    const { token } = createSession(db, u.id);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const rows = db.select().from(sessions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].idHash).toBe(sha(token));
    expect(rows[0].idHash).not.toBe(token);
  });

  test("sessão válida dentro do prazo e apagada depois de expirar", () => {
    const { db, u } = setup();
    const t0 = new Date("2026-01-01T00:00:00Z");
    const { token, expiresAt } = createSession(db, u.id, t0);
    expect(expiresAt.getTime()).toBe(t0.getTime() + SESSION_TTL_MS);

    const ok = validateSession(db, token, new Date(t0.getTime() + 3600_000));
    expect(ok).toEqual({ id: u.id, username: "pedro", isAdmin: true, sessionHash: sha(token) });

    expect(validateSession(db, token, new Date(t0.getTime() + SESSION_TTL_MS + 1))).toBeNull();
    expect(db.select().from(sessions).all()).toHaveLength(0);
  });

  test("token desconhecido retorna null", () => {
    const { db } = setup();
    expect(validateSession(db, "abc")).toBeNull();
  });

  test("deleteSession remove a sessão", () => {
    const { db, u } = setup();
    const { token } = createSession(db, u.id);
    deleteSession(db, token);
    expect(validateSession(db, token)).toBeNull();
  });

  test("deleteUserSessions mantém só a sessão indicada", () => {
    const { db, u } = setup();
    const keep = createSession(db, u.id).token;
    createSession(db, u.id);
    createSession(db, u.id);
    deleteUserSessions(db, u.id, sha(keep));
    const rows = db.select().from(sessions).all();
    expect(rows.map((r) => r.idHash)).toEqual([sha(keep)]);
  });
});

describe("cookie", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("em produção o cookie é seguro e usa o prefixo __Host-", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieName()).toBe("__Host-session");
    const opts = sessionCookieOptions(new Date(0));
    expect(opts).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/" });
  });

  test("COOKIE_SECURE=false desliga o secure", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "false");
    expect(sessionCookieName()).toBe("session");
    expect(sessionCookieOptions(new Date(0)).secure).toBe(false);
  });

  test("fora de produção o cookie não é secure", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(sessionCookieName()).toBe("session");
  });
});
