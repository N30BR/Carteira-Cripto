import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/password", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/auth/password")>();
  return { ...mod, verifyPassword: vi.fn(mod.verifyPassword) };
});

import { testDb } from "../helpers/db";
import { users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { attemptLogin } from "@/lib/auth/login";

describe("tempo constante", () => {
  test("conta bloqueada também roda a verificação argon2 (sem contar a tentativa)", async () => {
    const db = testDb();
    db.insert(users)
      .values({
        username: "pedro",
        passwordHash: await hashPassword("senha-certa"),
        isAdmin: false,
        createdAt: new Date(),
        lockedUntil: new Date(Date.now() + 60_000),
      })
      .run();
    vi.mocked(verifyPassword).mockClear();
    expect(await attemptLogin(db, "pedro", "senha-certa")).toEqual({ ok: false, reason: "invalid" });
    expect(verifyPassword).toHaveBeenCalledTimes(1);
  });
});
