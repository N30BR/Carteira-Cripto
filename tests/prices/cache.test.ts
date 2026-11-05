import { describe, expect, test, vi } from "vitest";
import { testDb } from "../helpers/db";
import { cached } from "@/lib/prices/cache";

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


  test("pedidos simultâneos da mesma chave vencida fazem uma busca só", async () => {
    const db = testDb();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const loader = vi.fn(async () => {
      await gate;
      return 7;
    });
    const all = Promise.all([1, 2, 3].map(() => cached(db, "k", 60_000, loader, t0)));
    release();
    const results = await all;
    expect(loader).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r?.data)).toEqual([7, 7, 7]);
    // Depois de terminar, uma chave vencida volta a buscar.
    await cached(db, "k", 60_000, loader, at(120_000));
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
