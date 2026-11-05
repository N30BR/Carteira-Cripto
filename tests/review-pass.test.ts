// Casos encontrados na revisão completa do código.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { testDb } from "./helpers/db";
import { sessions, users } from "@/db/schema";
import { formatPrice, formatQty } from "@/lib/format";
import { parseQuantity } from "@/lib/validation";
import { createUser, resetPassword, unlockUser } from "@/lib/admin/users";
import { createSession } from "@/lib/auth/sessions";
import { createWindowLimiter } from "@/lib/rate-limit";
import { resetBinanceState } from "@/lib/prices/binance";
import { getCurrentPrices, isListedAsset, searchCoins } from "@/lib/prices";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("quantidade e formatação", () => {
  test("quantidade com mais de 15 dígitos inteiros é recusada (evita US$ ∞)", () => {
    expect(parseQuantity("1".repeat(15)).ok).toBe(true);
    expect(parseQuantity("1".repeat(16))).toEqual({ ok: false, error: "Quantidade inválida" });
  });

  test("quantidade positiva menor que 8 casas não aparece como 0", () => {
    expect(formatQty("0.000000001")).toBe("< 0,00000001");
    expect(formatQty("0.00000001")).toBe("0,00000001");
  });

  test("preço de moeda barata mostra casas suficientes", () => {
    expect(formatPrice(0.00001234)).toBe("US$ 0,00001234");
    expect(formatPrice(0.1654)).toBe("US$ 0,1654");
    expect(formatPrice(0.5)).toBe("US$ 0,50");
    expect(formatPrice(1234.5)).toBe("US$ 1.234,50");
  });
});

describe("usuários", () => {
  test("duas criações simultâneas do mesmo nome não lançam erro técnico", async () => {
    const db = testDb();
    const input = { username: "pedro", password: "senha-certa", isAdmin: false };
    const results = await Promise.all([createUser(db, input), createUser(db, input)]);
    expect(results).toContainEqual({ ok: true });
    expect(results).toContainEqual({ ok: false, error: "Usuário já existe" });
  });

  test("redefinir senha ou desbloquear usuário inexistente avisa", async () => {
    const db = testDb();
    expect(await resetPassword(db, 999, "senha-nova-123")).toEqual({ ok: false, error: "Usuário não encontrado" });
    expect(unlockUser(db, 999)).toEqual({ ok: false, error: "Usuário não encontrado" });
  });

  test("criar sessão limpa sessões expiradas", () => {
    const db = testDb();
    const [u] = db.insert(users).values({ username: "a", passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all();
    db.insert(sessions).values({ idHash: "velha", userId: u.id, expiresAt: new Date(0) }).run();
    createSession(db, u.id);
    expect(db.select().from(sessions).all().map((s) => s.idHash)).not.toContain("velha");
  });
});

describe("limitador em memória", () => {
  test("descarta chaves antigas quando cresce demais", () => {
    const l = createWindowLimiter(5, 1000);
    const t0 = new Date(0);
    for (let i = 0; i < 1500; i++) l.hit(`ip${i}`, t0);
    l.hit("novo", new Date(5000));
    expect(l.size()).toBe(1);
  });
});

describe("Binance: falhas de símbolo e de lista", () => {
  const INFO = {
    symbols: [
      { symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT", status: "TRADING" },
      { symbol: "OLDUSDT", baseAsset: "OLD", quoteAsset: "USDT", status: "TRADING" },
    ],
  };
  beforeEach(() => {
    resetBinanceState();
    vi.stubEnv("BINANCE_BASE_URL", "https://bn.test");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("moeda deslistada não derruba o preço das outras nem pausa a API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = new URL(String(input));
        if (url.pathname === "/api/v3/exchangeInfo") return json(INFO);
        const symbols: string[] = JSON.parse(url.searchParams.get("symbols") ?? "[]");
        if (symbols.includes("OLDUSDT")) return json({ code: -1121, msg: "Invalid symbol." }, 400);
        return json(symbols.map((s) => ({ symbol: s, lastPrice: "10", priceChangePercent: "0" })));
      }),
    );
    const db = testDb();
    const r = await getCurrentPrices(db, ["BTC", "OLD"]);
    expect(r.prices).toEqual({ BTC: { usd: 10, change24h: 0 } });
    expect((await getCurrentPrices(db, ["BTC", "OLD"], new Date(Date.now() + 61_000))).prices.BTC).toBeDefined();
  });

  test("sem a lista de moedas: verificação fica indefinida e o preço antigo continua valendo", async () => {
    const db = testDb();
    const t0 = new Date("2026-01-01T00:00:00Z");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v3/exchangeInfo") return json(INFO);
      return json([{ symbol: "BTCUSDT", lastPrice: "100", priceChangePercent: "1" }]);
    }));
    await getCurrentPrices(db, ["BTC"], t0);

    // Dois dias depois: lista e preço expirados, e a Binance fora do ar.
    resetBinanceState();
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 503)));
    const later = new Date(t0.getTime() + 2 * 86_400_000);
    const stale = await getCurrentPrices(db, ["BTC"], later);
    expect(stale.prices.BTC).toEqual({ usd: 100, change24h: 1 });
    expect(stale.stale).toBe(true);

    const fresh = testDb();
    resetBinanceState();
    expect(await isListedAsset(fresh, "BTC", later)).toBeNull();
    expect(await searchCoins(fresh, "btc", later)).toBeNull();
  });
});

describe("busca de moedas", () => {
  beforeEach(() => resetBinanceState());
  afterEach(() => vi.unstubAllGlobals());

  test("nome exato vem antes de nome que só começa igual", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      json({
        symbols: ["BCH", "BTC"].map((b) => ({ symbol: `${b}USDT`, baseAsset: b, quoteAsset: "USDT", status: "TRADING" })),
      }),
    ));
    expect((await searchCoins(testDb(), "bitcoin"))!.map((c) => c.id)).toEqual(["BTC", "BCH"]);
  });
});
