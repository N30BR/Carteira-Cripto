import { afterEach, describe, expect, test } from "vitest";
import { testDb } from "./helpers/db";
import { fetchJsonCapped } from "@/lib/http";
import { aggregateCandles } from "@/lib/charts/params";
import { parseBgeometrics } from "@/lib/charts/onchain-math";
import { parseForexFactory } from "@/lib/news/calendar";
import { failureAllows, recordFailure, clearFailure } from "@/lib/charts/onchain-budget";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("revisão: respostas externas com teto", () => {
  test("recusa corpo maior que o teto (pelo cabeçalho ou pelo conteúdo)", async () => {
    globalThis.fetch = (async () => new Response("x".repeat(2000))) as typeof fetch;
    await expect(fetchJsonCapped("https://x", 1000, "Fonte")).rejects.toThrow(/grande demais/);
    globalThis.fetch = (async () => new Response(JSON.stringify([1, 2]))) as typeof fetch;
    expect(await fetchJsonCapped("https://x", 1000, "Fonte")).toEqual([1, 2]);
  });

  test("itens nulos são ignorados (não derrubam a leitura)", () => {
    expect(parseForexFactory([null, { title: "CPI m/m", country: "USD", date: "2026-11-10T08:30:00-05:00", impact: "High" }])).toHaveLength(1);
    expect(parseBgeometrics([null, { d: "2024-01-01", unixTs: 1704067200, sopr: 1 }], "sopr")).toHaveLength(1);
  });

  test("Forex Factory: no máximo 2000 eventos e só até 1 ano à frente", () => {
    const far = { title: "Futuro", country: "USD", date: new Date(Date.now() + 400 * 86_400_000).toISOString(), impact: "High" };
    expect(parseForexFactory([far])).toEqual([]);
    const many = Array.from({ length: 2100 }, (_, i) => ({ title: `E${i}`, country: "USD", date: new Date(Date.now() + i * 60_000).toISOString(), impact: "High" }));
    expect(parseForexFactory(many)).toHaveLength(2000);
  });
});

describe("revisão: BGeometrics sem adivinhar o campo", () => {
  test("só o campo esperado ou nomes alternativos conhecidos; outro número na linha não vira o indicador", () => {
    expect(parseBgeometrics([{ d: "2024-01-01", unixTs: 1704067200, mvrvZScore: 1.5 }], "mvrvZscore", ["mvrvZScore"])).toEqual([[1704067200000, 1.5]]);
    expect(() => parseBgeometrics([{ d: "2024-01-01", unixTs: 1704067200, btcPrice: 60000 }], "mvrvZscore")).toThrow();
  });
});

describe("revisão: vela 2D parcial no começo", () => {
  test("com histórico cortado, descarta o primeiro grupo incompleto", () => {
    const DAY = 86_400_000;
    const d = (n: number) => ({ timestamp: n * DAY, open: 1, high: 1, low: 1, close: 1, volume: 1 });
    // 20001 é a 2ª metade do par (20000, 20001): sozinho, seria uma "vela 2D" de 1 dia
    expect(aggregateCandles([d(20001), d(20002), d(20003)], "2d", { dropPartialFirst: true }).map((c) => c.timestamp / DAY)).toEqual([20002]);
    expect(aggregateCandles([d(20001), d(20002), d(20003)], "2d").map((c) => c.timestamp / DAY)).toEqual([20000, 20002]);
  });
});

describe("revisão: falhas guardadas no banco com espera crescente", () => {
  test("1ª falha: 1 h; 2ª: 4 h; da 3ª em diante só na janela da série; sucesso zera", () => {
    const db = testDb();
    const t0 = new Date("2026-11-06T00:30:00Z");
    const later = (h: number) => new Date(t0.getTime() + h * 3_600_000);
    recordFailure(db, "k", t0);
    expect(failureAllows(db, "k", 0, later(0.5))).toBe(false);
    expect(failureAllows(db, "k", 0, later(1.1))).toBe(true);
    recordFailure(db, "k", later(1.1));
    expect(failureAllows(db, "k", 0, later(3))).toBe(false);
    expect(failureAllows(db, "k", 0, later(5.2))).toBe(true);
    recordFailure(db, "k", later(5.2));
    // 3 falhas: só na janela 4 (19:12–24:00 UTC)
    expect(failureAllows(db, "k", 4, later(12))).toBe(false);
    expect(failureAllows(db, "k", 4, later(20))).toBe(true);
    clearFailure(db, "k", later(20));
    expect(failureAllows(db, "k", 0, later(20.1))).toBe(true);
  });
});
