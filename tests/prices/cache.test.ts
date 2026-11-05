import { describe, expect, test, vi } from "vitest";
import { testDb } from "../helpers/db";
import { priceCache } from "@/db/schema";
import { cached, pruneExpired } from "@/lib/prices/cache";

const t0 = new Date("2026-01-01T00:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);

describe("cached", () => {
  test("acerto no cache não chama o loader", async () => {
    const db = testDb();
    const loader = vi.fn(async () => 1);
    await cached(db, "k", 60_000, loader, t0);
    const r = await cached(db, "k", 60_000, loader, at(30_000));
    expect(loader).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ data: 1, fetchedAt: t0, stale: false });
  });

  test("expirado chama o loader de novo", async () => {
    const db = testDb();
    let n = 0;
    const loader = async () => ++n;
    await cached(db, "k", 60_000, loader, t0);
    const r = await cached(db, "k", 60_000, loader, at(60_001));
    expect(r?.data).toBe(2);
    expect(r?.stale).toBe(false);
  });

  test("falha com cache antigo devolve o antigo marcado como stale", async () => {
    const db = testDb();
    await cached(db, "k", 60_000, async () => 1, t0);
    const r = await cached(db, "k", 60_000, async () => { throw new Error("429"); }, at(120_000));
    expect(r).toEqual({ data: 1, fetchedAt: t0, stale: true });
  });

  test("falha sem cache devolve null", async () => {
    const db = testDb();
    expect(await cached(db, "k", 60_000, async () => { throw new Error("x"); }, t0)).toBeNull();
  });

  test("pruneExpired apaga só o prefixo indicado e só os expirados", async () => {
    const db = testDb();
    await cached(db, "search:a", 1000, async () => 1, t0);
    await cached(db, "search:b", 100_000, async () => 1, t0);
    await cached(db, "price:x", 1000, async () => 1, t0);
    pruneExpired(db, "search:", at(5000));
    expect(db.select().from(priceCache).all().map((r) => r.key).sort()).toEqual(["price:x", "search:b"]);
  });
});
