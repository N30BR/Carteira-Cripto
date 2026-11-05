import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { testDb } from "../helpers/db";
import { fetchMarketChart } from "@/lib/prices/coingecko";
import { getCurrentPrices, getHistory, searchCoins } from "@/lib/prices";

type Handler = (url: URL, init?: RequestInit) => Promise<Response> | Response;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function stubFetch(handler: Handler) {
  const fn = vi.fn((input: string | URL, init?: RequestInit) => Promise.resolve(handler(new URL(String(input)), init)));
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  vi.stubEnv("COINGECKO_BASE_URL", "https://cg.test/api/v3");
  vi.stubEnv("COINGECKO_API_KEY", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("getCurrentPrices", () => {
  test("monta a URL de simple/price e converte a resposta", async () => {
    const fn = stubFetch(() => json({ bitcoin: { usd: 60000, usd_24h_change: 1.5 }, ethereum: { usd: 3000 } }));
    const r = await getCurrentPrices(testDb(), ["ethereum", "bitcoin"]);
    const url = new URL(String(fn.mock.calls[0][0]));
    expect(url.pathname).toBe("/api/v3/simple/price");
    expect(url.searchParams.get("ids")).toBe("bitcoin,ethereum");
    expect(url.searchParams.get("vs_currencies")).toBe("usd");
    expect(url.searchParams.get("include_24hr_change")).toBe("true");
    expect(r.prices).toEqual({ bitcoin: { usd: 60000, change24h: 1.5 }, ethereum: { usd: 3000, change24h: null } });
    expect(r.stale).toBe(false);
  });

  test("envia a chave Demo quando configurada", async () => {
    vi.stubEnv("COINGECKO_API_KEY", "k123");
    const fn = stubFetch(() => json({}));
    await getCurrentPrices(testDb(), ["bitcoin"]);
    const headers = new Headers(fn.mock.calls[0][1]?.headers);
    expect(headers.get("x-cg-demo-api-key")).toBe("k123");
  });

  test("429 sem cache: tenta de novo uma vez e devolve vazio sem lançar", async () => {
    vi.useFakeTimers();
    const fn = stubFetch(() => json({ error: "rate" }, 429));
    const p = getCurrentPrices(testDb(), ["bitcoin"]);
    await vi.runAllTimersAsync();
    expect(await p).toEqual({ prices: {}, fetchedAt: null, stale: false });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("erro no corpo com HTTP 200 é tratado como falha (não grava cache vazio)", async () => {
    vi.useFakeTimers();
    const db = testDb();
    stubFetch(() => json({ bitcoin: { usd: 1, usd_24h_change: 0 } }));
    const t0 = new Date("2026-01-01T00:00:00Z");
    await getCurrentPrices(db, ["bitcoin"], t0);
    stubFetch(() => json({ status: { error_code: 429, error_message: "rate" } }));
    const p = getCurrentPrices(db, ["bitcoin"], new Date(t0.getTime() + 120_000));
    await vi.runAllTimersAsync();
    const r = await p;
    expect(r.prices).toEqual({ bitcoin: { usd: 1, change24h: 0 } });
    expect(r.stale).toBe(true);
  });

  test("lista vazia não chama a API", async () => {
    const fn = stubFetch(() => json({}));
    expect(await getCurrentPrices(testDb(), [])).toEqual({ prices: {}, fetchedAt: null, stale: false });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("fila de requisições", () => {
  test("nunca mais de 2 em andamento", async () => {
    let inFlight = 0;
    let max = 0;
    stubFetch(async () => {
      inFlight++;
      max = Math.max(max, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return json({ prices: [[1, 2]] });
    });
    await Promise.all([1, 2, 3, 4, 5].map((i) => fetchMarketChart(`c${i}`, 30)));
    expect(max).toBe(2);
  });
});

describe("getHistory", () => {
  test("7D e 30D usam a mesma busca de 30 dias", async () => {
    const fn = stubFetch(() => json({ prices: [[1000, 5]] }));
    const db = testDb();
    const a = await getHistory(db, ["bitcoin"], "7D");
    const b = await getHistory(db, ["bitcoin"], "30D");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(new URL(String(fn.mock.calls[0][0])).searchParams.get("days")).toBe("30");
    expect(a.history).toEqual({ bitcoin: [[1000, 5]] });
    expect(b.history).toEqual(a.history);
  });

  test("1A busca 365 dias; moeda que falha sem cache fica de fora", async () => {
    const fn = stubFetch((url) => (url.pathname.includes("/ruim/") ? json({}, 500) : json({ prices: [[1, 1]] })));
    const r = await getHistory(testDb(), ["bitcoin", "ruim"], "1A");
    expect(new URL(String(fn.mock.calls[0][0])).searchParams.get("days")).toBe("365");
    expect(Object.keys(r.history)).toEqual(["bitcoin"]);
    expect(r.oldestFetchedAt).toBeInstanceOf(Date);
  });
});

describe("searchCoins", () => {
  test("termo curto não chama a API", async () => {
    const fn = stubFetch(() => json({ coins: [] }));
    expect(await searchCoins(testDb(), "b")).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  test("normaliza o termo, limita a 10 e usa cache", async () => {
    const coins = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, symbol: `C${i}`, name: `Coin ${i}`, thumb: "t", extra: 1 }));
    const fn = stubFetch(() => json({ coins }));
    const db = testDb();
    const r = await searchCoins(db, "  BIT ");
    await searchCoins(db, "bit");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(new URL(String(fn.mock.calls[0][0])).searchParams.get("query")).toBe("bit");
    expect(r).toHaveLength(10);
    expect(r[0]).toEqual({ id: "c0", symbol: "C0", name: "Coin 0", thumb: "t" });
  });
});
