import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { testDb } from "./helpers/db";

const state = vi.hoisted(() => ({ user: { id: 1 } as { id: number } | null, db: null as unknown }));
vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: () => state.db }));
vi.mock("@/lib/auth/current", () => ({ getCurrentUser: async () => state.user }));
const modules = vi.hoisted(() => ({ on: true }));
vi.mock("@/lib/auth/modules", () => ({ moduleOn: () => modules.on }));

import { GET } from "@/app/api/market/route";
import { resetMarketRouteLimits } from "@/lib/charts/route-limit";
import { DAY, breadth, buildAggregates, changeOver, closeToNextDay, mergeDaily, othersCap, seasonOf, topEligible, type CoinRow } from "@/lib/market/calc";
import { parseAltseasonHistory, parseCmcGlobal, parseCmcListings, parseCoinMetricsMulti, parseEtfHistory, parseEtfSummary, parseLlamaStables } from "@/lib/market/parse";
import { classify, consolidate, cycleState, percentile, piCycle, bullBand, type Reading } from "@/lib/market/onchain-read";
import { flowSum, readFlows, summarizeFund, trendOf } from "@/lib/market/etf";
import { isMarketId } from "@/lib/market/ids";
import { addDecimal, addToHolding, upsertHolding, listHoldings } from "@/lib/holdings/holdings";
import { MAX_VIEWS, sanitizeTabState, sanitizeView, withView, defaultPane } from "@/lib/charts/workspace";
import { users } from "@/db/schema";
import type { Db } from "@/db/client";

const T0 = Date.UTC(2026, 9, 1);

describe("mercado: agregados e dominâncias", () => {
  test("Coin Metrics (fechamento do dia D) alinha com 00:00 do dia D+1", () => {
    expect(closeToNextDay([[Date.UTC(2026, 10, 5), 1]])).toEqual([[Date.UTC(2026, 10, 6), 1]]);
  });

  test("TOTAL = altcoins + BTC; TOTAL3 = altcoins − ETH; dominâncias em % do TOTAL; sem dado não entra", () => {
    const r = buildAggregates({
      alt: [
        [T0, 1000],
        [T0 + DAY, 1100],
      ],
      btc: [[T0, 1500]], // só no 1º dia
      eth: [[T0, 300]],
      usdt: [[T0, 180]],
      usdc: [],
      stables: [[T0, 250]],
    });
    expect(r.TOTAL).toEqual([[T0, 2500]]);
    expect(r.TOTAL2).toEqual([
      [T0, 1000],
      [T0 + DAY, 1100],
    ]);
    expect(r.TOTAL3).toEqual([[T0, 700]]);
    expect(r["BTC.D"]).toEqual([[T0, 60]]);
    expect(r["ETH.D"]).toEqual([[T0, 12]]);
    expect(r["USDT.D"]![0][0]).toBe(T0);
    expect(r["USDT.D"]![0][1]).toBeCloseTo(7.2);
    expect(r["STABLE.D"]).toEqual([[T0, 10]]);
    expect(r["USDC.D"]).toEqual([]); // sem dado: vazio, nunca zero
  });

  test("variação no período: % ou pontos; sem ponto inicial próximo, null", () => {
    const pts: [number, number][] = [
      [T0, 50],
      [T0 + 7 * DAY, 55],
    ];
    expect(changeOver(pts, 7, "pp")).toBeCloseTo(5);
    expect(changeOver(pts, 7, "pct")).toBeCloseTo(10);
    expect(changeOver(pts, 30, "pct")).toBeNull();
    expect(changeOver([[T0, 1]], 1, "pct")).toBeNull();
  });

  test("histórico guardado + recalculado: o recalculado vence no mesmo dia", () => {
    expect(
      mergeDaily(
        [
          [T0, 1],
          [T0 + DAY, 2],
        ],
        [[T0 + DAY + 3600_000, 9]],
      ),
    ).toEqual([
      [T0, 1],
      [T0 + DAY, 9],
    ]);
  });

  const coin = (rank: number, symbol: string, mcap: number, change: number | null, tags: string[] = []): CoinRow => ({
    id: rank,
    rank,
    name: symbol,
    symbol,
    marketCap: mcap,
    price: 1,
    tags,
    change: { "1D": change, "7D": change, "30D": change, "90D": change },
  });

  test("Top 100: sem stablecoins e ouro tokenizado; amplitude e % de alts acima do BTC", () => {
    const coins = [coin(1, "BTC", 100, 10), coin(2, "ETH", 50, 20), coin(3, "USDT", 40, 0, ["stablecoin"]), coin(4, "PAXG", 5, 3, ["tokenized-gold"]), coin(5, "SOL", 10, -5), coin(6, "XRP", 9, null)];
    const top = topEligible(coins, 100);
    expect(top.map((c) => c.symbol)).toEqual(["BTC", "ETH", "SOL", "XRP"]);
    const b = breadth(top, "90D");
    expect(b).toMatchObject({ up: 2, down: 1, total: 3, btc: 10 });
    expect(b.median).toBe(10);
    expect(b.beatBtc).toBeCloseTo(50); // ETH sim, SOL não (XRP sem variação fica fora)
  });

  test("OTHERS = total − 10 maiores; com menos de 10 moedas, indisponível", () => {
    const ten = Array.from({ length: 10 }, (_, i) => coin(i + 1, `C${i}`, 10, 0));
    expect(othersCap(150, ten)).toBe(50);
    expect(othersCap(150, ten.slice(0, 9))).toBeNull();
  });

  test("faixas da altseason (CoinMarketCap)", () => {
    expect(seasonOf(80)).toBe("Altcoin Season");
    expect(seasonOf(20)).toBe("Bitcoin Season");
    expect(seasonOf(44)).toBe("Neutro");
  });

  test("ids de mercado: lista fechada", () => {
    expect(isMarketId("TOTAL3")).toBe(true);
    expect(isMarketId("BTC.D")).toBe(true);
    expect(isMarketId("BTCUSDT")).toBe(false);
  });
});

describe("mercado: leitura das fontes", () => {
  test("CoinMarketCap global e listagem; resposta estranha vira erro (não número inventado)", () => {
    const g = parseCmcGlobal({ data: { btc_dominance: 59.9, eth_dominance: 10.7, quote: { USD: { total_market_cap: 2.5e12, altcoin_market_cap: 1e12 } } } });
    expect(g).toMatchObject({ total: 2.5e12, alt: 1e12, btcD: 59.9, ethD: 10.7 });
    expect(() => parseCmcGlobal({ data: {} })).toThrow();
    const l = parseCmcListings({
      data: [{ id: 1, cmc_rank: 1, name: "Bitcoin", symbol: "BTC", tags: ["mineable"], quote: { USD: { price: 75000, market_cap: 1.5e12, percent_change_24h: 0.4, percent_change_90d: 17.3 } } }, { id: 9 }],
    });
    expect(l).toHaveLength(1);
    expect(l[0].change).toEqual({ "1D": 0.4, "7D": null, "30D": null, "90D": 17.3 });
  });

  test("histórico do índice de altseason com o market cap das altcoins", () => {
    const r = parseAltseasonHistory({ data: { points: [{ timestamp: "2026-11-07T00:00:00Z", altcoin_index: 43, altcoin_marketcap: 1.02e12 }, { timestamp: "x", altcoin_index: 1 }, { timestamp: "2026-11-06T00:00:00Z", altcoin_index: 140 }] } });
    expect(r.index).toEqual([[Date.UTC(2026, 10, 7), 43]]);
    expect(r.alt).toEqual([[Date.UTC(2026, 10, 7), 1.02e12]]);
  });

  test("Coin Metrics multi-ativo e DefiLlama (soma de todas as moedas de lastro)", () => {
    const cm = parseCoinMetricsMulti({ data: [{ asset: "eth", time: "2026-11-05T00:00:00.000000000Z", CapMrktCurUSD: "2.7e11" }] }, ["CapMrktCurUSD"]);
    expect(cm.eth.CapMrktCurUSD).toEqual([[Date.UTC(2026, 10, 5), 2.7e11]]);
    const st = parseLlamaStables([{ date: "1793923200", totalCirculatingUSD: { peggedUSD: 100, peggedEUR: 5 } }]);
    expect(st).toEqual([[1793923200 * 1000, 105]]);
  });

  test("SoSoValue: resumo diário e histórico por ETF (linha não liquidada fica de fora)", () => {
    const s = parseEtfSummary({ data: [{ date: "2024-04-12", total_net_inflow: -55066297, total_net_assets: 56216535367, cum_net_inflow: 13534833596 }] });
    expect(s[0]).toMatchObject({ date: "2024-04-12", netInflow: -55066297 });
    const h = parseEtfHistory(
      [
        { date: "2024-04-12", net_inflow: 3000000, net_assets: 5000000 },
        { date: "2024-04-13", net_inflow: null },
      ],
      "IBIT",
    );
    expect(h).toEqual([{ ticker: "IBIT", date: "2024-04-12", netInflow: 3000000, netAssets: 5000000, cumInflow: null, valueTraded: null }]);
  });
});

describe("on-chain: classificação e leitura do ciclo", () => {
  const daily = (n: number, f: (i: number) => number): [number, number][] => Array.from({ length: n }, (_, i) => [Date.UTC(2013, 0, 1) + i * DAY, f(i)]);

  test("percentil e faixas; sem 365 dias de história, sem nota", () => {
    expect(percentile([1, 2, 3, 4], 4)).toBe(87.5);
    expect(classify("MVRV_Z", daily(100, (i) => i), [])).toBeNull();
    const low = classify("MVRV_Z", daily(1000, (i) => (i === 999 ? -5 : Math.sin(i))), []);
    expect(low?.category).toBe("Fundo");
    expect(low?.intensity).toBeGreaterThan(90);
    const high = classify("PUELL", daily(1000, (i) => (i === 999 ? 99 : Math.sin(i))), []);
    expect(high?.category).toBe("Topo");
  });

  test("SOPR: média de 7 dias abaixo de 1 = prejuízo realizado (lado frio)", () => {
    const r = classify("SOPR", daily(800, (i) => (i > 790 ? 0.95 : 1 + 0.02 * Math.sin(i))), []);
    expect(r?.reading).toBeLessThan(1);
    expect(["Acumulação", "Capitulação"]).toContain(r?.category);
  });

  test("preço realizado: razão preço/RP; abaixo de 1 = Fundo", () => {
    const rp = daily(800, () => 100);
    const price = daily(800, (i) => (i === 799 ? 90 : 150 + 10 * Math.sin(i)));
    const r = classify("REALIZED_PRICE", rp, price);
    expect(r?.reading).toBeCloseTo(0.9);
    expect(r?.category).toBe("Fundo");
  });

  test("consolidado: grupos (correlacionados contam 1 vez); menos de 3 grupos = Indefinido; ausentes não viram zero", () => {
    const at = (p: number): Reading => ({ reading: 0, position: p, category: p < 30 ? "Acumulação" : p >= 70 ? "Aquecimento" : "Neutro", intensity: Math.round(Math.abs(p - 50) * 2), label: "" });
    const few = consolidate({ MVRV_Z: at(20), NUPL: at(20), REALIZED_PRICE: at(20) });
    expect(few.score).toBeNull();
    expect(few.state).toBe("Indefinido");
    expect(few.available).toBe(3);
    const c = consolidate({ MVRV_Z: at(10), NUPL: at(30), SOPR: at(20), PUELL: at(20), RHODL: at(80), EXCHANGE_NETFLOW: null });
    // Grupos: valor 20, lucro 20, mineradores 20, longo prazo 80 → média 35.
    expect(c.score).toBe(35);
    expect(c.state).toBe(cycleState(35));
    expect(c.divergences.length).toBe(1);
    expect(c.available).toBe(5);
  });

  test("Pi Cycle e Bull Market Support Band a partir do preço diário", () => {
    const flat = daily(500, () => 100);
    expect(piCycle(flat)).toMatchObject({ fast: 100, slow: 200, crossedRecently: false });
    expect(bullBand(flat)?.state).toBe("Dentro");
    expect(piCycle(daily(100, () => 1))).toBeNull();
  });
});

describe("ETFs: fluxos", () => {
  const rows = [
    { date: "2026-11-02", netInflow: 100 },
    { date: "2026-11-03", netInflow: 200 },
    { date: "2026-11-04", netInflow: -50 },
    { date: "2026-11-05", netInflow: 300 },
    { date: "2026-11-06", netInflow: 400 },
  ];
  test("somas por dias corridos até a última sessão; sem sessões = null", () => {
    expect(flowSum(rows, 1)).toBe(400);
    expect(flowSum(rows, 3)).toBe(650);
    expect(flowSum([], 7)).toBeNull();
  });
  test("tendência e leitura", () => {
    expect(trendOf(rows)).toBe("Entradas");
    const f = summarizeFund("IBIT", "iShares", rows.map((r) => ({ ...r, ticker: "IBIT", netAssets: 1e9, cumInflow: null, valueTraded: null })));
    expect(f).toMatchObject({ day: 400, issuer: "BlackRock (iShares)", aum: 1e9 });
    expect(readFlows(rows.map((r) => ({ ...r, netAssets: null, cumInflow: null, valueTraded: null })), [f]).state).toBe("Fluxo positivo");
  });
});

describe("+Transação (Ativos): soma exata", () => {
  test("decimais exatos, sem erro de ponto flutuante", () => {
    expect(addDecimal("0.1", "0.2")).toBe("0.3");
    expect(addDecimal("1", "0.000000000000000001")).toBe("1.000000000000000001");
    expect(addDecimal("2.5", "2.5")).toBe("5");
  });
  test("soma no ativo da própria pessoa; de outra pessoa, não encontra", () => {
    const db = testDb();
    const [a] = db.insert(users).values({ username: "a", passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all();
    const [b] = db.insert(users).values({ username: "b", passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all();
    upsertHolding(db, a.id, { coinId: "BTC", symbol: "BTC", name: "Bitcoin", quantity: "0.5" });
    const h = listHoldings(db, a.id)[0];
    expect(addToHolding(db, a.id, h.id, "0.1")).toEqual({ ok: true, quantity: "0.6" });
    expect(addToHolding(db, b.id, h.id, "1")).toEqual({ ok: false, error: "Ativo não encontrado" });
    expect(listHoldings(db, a.id)[0].quantity).toBe("0.6");
  });
});

describe("Gráficos: zoom salvo, Girar e instrumentos de mercado", () => {
  test("janela salva por par/tempo; inválida é descartada (não derruba o gráfico)", () => {
    const v = { symbol: "BTCUSDT", interval: "4h", barSpace: 6, to: Date.UTC(2022, 10, 15) };
    expect(sanitizeView(v)).toEqual(v);
    expect(sanitizeView({ ...v, barSpace: 9999 })).toBeUndefined();
    expect(sanitizeView({ ...v, to: "ontem" })).toBeUndefined();
    let list = withView(undefined, v as never);
    list = withView(list, { ...v, barSpace: 8 } as never);
    expect(list).toHaveLength(1);
    expect(list[0].barSpace).toBe(8);
    for (let i = 0; i < 20; i++) list = withView(list, { ...v, symbol: `X${i}USDT` } as never);
    expect(list).toHaveLength(MAX_VIEWS);
    const tab = sanitizeTabState({ layout: 1, panes: [{ ...defaultPane(), views: [v, { bad: 1 }] }] });
    expect(tab.ok && tab.value.panes[0].views).toEqual([v]);
  });

  test("gráfico de TOTAL3/BTC.D e comparação de mercado são aceitos; símbolo desconhecido não", () => {
    expect(sanitizeTabState({ layout: 1, panes: [{ ...defaultPane("TOTAL3"), compares: [{ kind: "market", id: "BTC.D" }] }] }).ok).toBe(true);
    expect(sanitizeTabState({ layout: 1, panes: [{ ...defaultPane("TOTAL9") }] }).ok).toBe(false);
    expect(sanitizeTabState({ layout: 1, panes: [{ ...defaultPane(), compares: [{ kind: "market", id: "XYZ" }] }] }).ok).toBe(false);
  });

  test("perfil de volume: Girar (mirror) só aceita sim/não", () => {
    const ov = (styles: unknown) => ({ layout: 1, panes: [{ ...defaultPane(), overlays: [{ id: "o1", name: "fixedRangeVolumeProfile", points: [{ timestamp: 1, value: 1 }, { timestamp: 2, value: 2 }], styles }] }] });
    expect(sanitizeTabState(ov({ mirror: true })).ok).toBe(true);
    expect(sanitizeTabState(ov({ mirror: "sim" })).ok).toBe(false);
  });
});

describe("rota /api/market", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    state.user = { id: 1 };
    state.db = testDb();
    modules.on = true;
    resetMarketRouteLimits();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  const call = (q: string) => GET(new Request(`http://x/api/market?${q}`));

  test("exige login, módulo e id da lista fechada", async () => {
    state.user = null;
    expect((await call("id=TOTAL")).status).toBe(401);
    state.user = { id: 1 };
    modules.on = false;
    expect((await call("id=TOTAL")).status).toBe(404);
    modules.on = true;
    expect((await call("id=../../etc")).status).toBe(400);
  });

  test("fonte fora do ar: 503 com mensagem, sem números inventados", async () => {
    globalThis.fetch = (async () => new Response("{}", { status: 500 })) as typeof fetch;
    const r = await call("id=BTC.D");
    expect(r.status).toBe(503);
    expect((await r.json()).points).toBeUndefined();
    void (state.db as Db);
  });
});

describe("pares invertidos (BTC/ETH e USDTUSD/BTCUSD)", () => {
  test("USDTUSD/BTCUSD sai do BTC/USDT invertido, com nome próprio; aceito como gráfico e comparação", async () => {
    const { invertedPair, instrumentLabel } = await import("@/lib/market/ids");
    expect(invertedPair("USDTBTC")).toMatchObject({ source: "BTCUSDT", label: "USDTUSD/BTCUSD" });
    expect(invertedPair("BTCETH")?.source).toBe("ETHBTC");
    expect(invertedPair("toString")).toBeUndefined();
    expect(instrumentLabel("USDTBTC", (s) => s)).toBe("USDTUSD/BTCUSD");
    expect(instrumentLabel("BTCUSDT", (s) => `${s}!`)).toBe("BTCUSDT!");
    expect(sanitizeTabState({ layout: 1, panes: [{ ...defaultPane("USDTBTC"), compares: [{ kind: "pair", id: "USDTBTC" }] }] }).ok).toBe(true);
  });
});
