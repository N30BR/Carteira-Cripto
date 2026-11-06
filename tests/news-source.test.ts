import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { testDb } from "./helpers/db";
import { getNewsData } from "@/lib/news/source";

const realFetch = globalThis.fetch;
let calls = 0;
let fail = false;
const feed = [{ title: "Non-Farm Employment Change", country: "USD", date: "2026-11-06T08:30:00-05:00", impact: "High", forecast: "65K", previous: "29K" }];

beforeEach(() => {
  calls = 0;
  fail = false;
  globalThis.fetch = (async () => {
    calls++;
    if (fail) return new Response("erro", { status: 503 });
    return new Response(JSON.stringify(feed));
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("calendário econômico: busca e cache", () => {
  test("busca uma vez e guarda; dentro de 30 min não busca de novo", async () => {
    const db = testDb();
    const now = new Date("2026-11-06T12:00:00Z");
    const a = await getNewsData(db, now);
    expect(a.events).toHaveLength(1);
    expect(a.uncovered).toEqual(["BR"]); // Brasil sem fonte gratuita com classificação de impacto
    await getNewsData(db, new Date(now.getTime() + 10 * 60_000));
    expect(calls).toBe(1);
    await getNewsData(db, new Date(now.getTime() + 31 * 60_000));
    expect(calls).toBe(2);
  });

  test("fonte fora: mantém os últimos dados válidos e avisa que podem estar desatualizados (nada inventado)", async () => {
    const db = testDb();
    const now = new Date("2026-11-06T12:00:00Z");
    await getNewsData(db, now);
    fail = true;
    const r = await getNewsData(db, new Date(now.getTime() + 40 * 60_000));
    expect(r.events).toHaveLength(1);
    expect(r.stale).toBe(true);
    // em pausa depois da falha: não insiste
    await getNewsData(db, new Date(now.getTime() + 45 * 60_000));
    expect(calls).toBe(2);
  });

  test("sem nada guardado e fonte fora: lista vazia, marcada como desatualizada", async () => {
    fail = true;
    const r = await getNewsData(testDb(), new Date("2026-11-06T12:00:00Z"));
    expect(r).toMatchObject({ events: [], stale: true, fetchedAt: null });
  });
});
