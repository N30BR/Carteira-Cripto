// Dados da aba Cripto (servidor). Só fontes reais, com cache no banco; cada parte falha sozinha
// (um indicador fora do ar não derruba a página) e nada ausente vira zero.
//
// Fontes:
// - CoinMarketCap, API pública SEM chave (pro-api.coinmarketcap.com/public-api): mercado global atual, listagem
//   (preço, market cap e variações 24h/7d/30d/90d), Altcoin Season Index oficial (atual e 90 dias, com o market cap
//   das altcoins de cada dia). Cache de 10 a 60 min.
// - Coin Metrics, API comunitária: market cap diário de BTC, ETH, USDT e USDC e o preço diário do BTC.
// - DefiLlama (stablecoins.llama.fi): soma diária de todas as stablecoins (sem dupla contagem, lista própria).
// - BGeometrics + Coin Metrics: os 10 indicadores on-chain (mesmo serviço da aba Gráficos, com a mesma cota).
// - SoSoValue (ETFs): exige chave (SOSOVALUE_API_KEY, só no servidor). Sem chave: "Fonte não configurada".
//
// O histórico de capitalização/dominância sai da combinação (altcoins da CoinMarketCap + BTC/ETH/USDT/USDC da Coin
// Metrics + stablecoins da DefiLlama), 90 dias por vez; cada dia calculado é guardado no banco, então o histórico
// cresce com o tempo. OTHERS (fora das 10 maiores) só existe a partir dos dias guardados.
import type { Db } from "@/db/client";
import { fetchJsonCapped } from "@/lib/http";
import { cached, readCache, writeCache } from "@/lib/prices/cache";
import { ONCHAIN_IDS, ONCHAIN_SERIES, getOnchainSeries, type OnchainId } from "@/lib/charts/onchain";
import { DAY, type CoinRow, type Pt, buildAggregates, closeToNextDay, dayStart, mergeDaily, othersCap, topEligible } from "./calc";
import { MARKET_IDS, type MarketId } from "./ids";
import { bullBand, classify, consolidate, piCycle, type Consolidated, type Reading } from "./onchain-read";
import {
  type AltseasonLatest,
  type CmcGlobal,
  type EtfDaily,
  type EtfFundRow,
  parseAltseasonHistory,
  parseAltseasonLatest,
  parseCmcGlobal,
  parseCmcListings,
  parseCoinMetricsMulti,
  parseEtfHistory,
  parseEtfList,
  parseEtfSummary,
  parseLlamaStables,
} from "./parse";
import { type EtfReading, type FundSummary, readFlows, summarizeFund } from "./etf";

const MIN = 60_000;
const HOUR = 60 * MIN;
const YEARS = 10 * 365 * DAY;

// Sem chave: API pública (cota anônima pequena, por isso o cache e as chamadas em sequência). Com CMC_API_KEY
// (chave gratuita da CoinMarketCap, só no servidor): mesmos caminhos na API com chave, com limites maiores.
const cmcKey = () => {
  const k = process.env.CMC_API_KEY;
  return k && /^[A-Za-z0-9-]{16,64}$/.test(k) ? k : null;
};
const cmcBase = () => process.env.CMC_PUBLIC_BASE_URL ?? (cmcKey() ? "https://pro-api.coinmarketcap.com" : "https://pro-api.coinmarketcap.com/public-api");
const cmcGet = (path: string, maxBytes: number) => {
  const key = cmcKey();
  return fetchJsonCapped(`${cmcBase()}${path}`, maxBytes, "CoinMarketCap", 20_000, key ? { "X-CMC_PRO_API_KEY": key } : undefined);
};
const cmBase = () => process.env.COINMETRICS_BASE_URL ?? "https://community-api.coinmetrics.io";
const llamaBase = () => process.env.DEFILLAMA_STABLES_URL ?? "https://stablecoins.llama.fi";
const sosoBase = () => process.env.SOSOVALUE_BASE_URL ?? "https://openapi.sosovalue.com/openapi/v1";

export type Part<T> = { ok: true; data: T; stale: boolean; at: number } | { ok: false; error: string };

async function part<T>(db: Db, key: string, ttl: number, loader: () => Promise<T>, now: Date, unavailable: string): Promise<Part<T>> {
  try {
    const r = await cached(db, key, ttl, loader, now);
    return r ? { ok: true, data: r.data, stale: r.stale, at: r.fetchedAt.getTime() } : { ok: false, error: unavailable };
  } catch {
    return { ok: false, error: unavailable };
  }
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

// ---------- fontes ----------

const cmcGlobal = (db: Db, now: Date) =>
  part<CmcGlobal>(db, "market:cmc:global:v1", 10 * MIN, async () => parseCmcGlobal(await cmcGet("/v1/global-metrics/quotes/latest", 200_000)), now, "CoinMarketCap indisponível no momento");

const cmcListings = (db: Db, now: Date) =>
  part<CoinRow[]>(
    db,
    "market:cmc:listings:v1",
    10 * MIN,
    async () => parseCmcListings(await cmcGet("/v1/cryptocurrency/listings/latest?limit=200", 3_000_000)),
    now,
    "CoinMarketCap indisponível no momento",
  );

/**
 * Posição por capitalização (CoinMarketCap, top 200) de cada símbolo — para ordenar o seletor de pares.
 * Sem a fonte, devolve vazio (a lista fica em ordem alfabética).
 */
export async function getCoinRanks(db: Db, now = new Date()): Promise<Record<string, number>> {
  const l = await cmcListings(db, now);
  const out: Record<string, number> = {};
  if (l.ok) for (const c of l.data) if (!(c.symbol in out)) out[c.symbol] = c.rank;
  return out;
}

const altLatest = (db: Db, now: Date) =>
  part<AltseasonLatest>(db, "market:cmc:asi:latest:v1", 15 * MIN, async () => parseAltseasonLatest(await cmcGet("/v1/altcoin-season-index/latest", 100_000)), now, "Índice de altseason indisponível no momento");

const altHistory = (db: Db, now: Date) =>
  part<{ index: Pt[]; alt: Pt[] }>(
    db,
    "market:cmc:asi:90d:v1",
    HOUR,
    async () => {
      const r = parseAltseasonHistory(await cmcGet("/v1/altcoin-season-index/historical?timeframe=90d", 500_000));
      if (!r.index.length) throw new Error("sem dados");
      return r;
    },
    now,
    "Histórico de altseason indisponível no momento",
  );

/** Market cap diário de BTC, ETH, USDT e USDC (últimos ~400 dias), alinhado às 00:00 do dia seguinte. */
const caps = (db: Db, now: Date) =>
  part<Record<"btc" | "eth" | "usdt" | "usdc", Pt[]>>(
    db,
    "market:cm:caps:v1",
    6 * HOUR,
    async () => {
      const q = new URLSearchParams({ assets: "btc,eth,usdt,usdc", metrics: "CapMrktCurUSD", frequency: "1d", start_time: iso(now.getTime() - 400 * DAY), page_size: "10000" });
      const r = parseCoinMetricsMulti(await fetchJsonCapped(`${cmBase()}/v4/timeseries/asset-metrics?${q}`, 3_000_000, "Coin Metrics"), ["CapMrktCurUSD"]);
      const get = (a: string) => closeToNextDay(r[a]?.CapMrktCurUSD ?? []);
      if (!get("btc").length) throw new Error("sem dados");
      return { btc: get("btc"), eth: get("eth"), usdt: get("usdt"), usdc: get("usdc") };
    },
    now,
    "Coin Metrics indisponível no momento",
  );

/** Preço diário do BTC desde 2011 (base das razões preço/preço realizado e dos modelos de ciclo). */
export const btcPrice = (db: Db, now: Date) =>
  part<Pt[]>(
    db,
    "market:cm:btcprice:v1",
    12 * HOUR,
    async () => {
      const q = new URLSearchParams({ assets: "btc", metrics: "PriceUSD", frequency: "1d", start_time: "2011-01-01", page_size: "10000" });
      const r = parseCoinMetricsMulti(await fetchJsonCapped(`${cmBase()}/v4/timeseries/asset-metrics?${q}`, 5_000_000, "Coin Metrics"), ["PriceUSD"]);
      const p = r.btc?.PriceUSD ?? [];
      if (!p.length) throw new Error("sem dados");
      return p;
    },
    now,
    "Preço histórico do BTC indisponível no momento",
  );

const stables = (db: Db, now: Date) =>
  part<Pt[]>(
    db,
    "market:llama:stables:v1",
    6 * HOUR,
    async () => {
      const all = parseLlamaStables(await fetchJsonCapped(`${llamaBase()}/stablecoincharts/all`, 5_000_000, "DefiLlama"));
      if (!all.length) throw new Error("sem dados");
      return all.filter(([t]) => t >= now.getTime() - 400 * DAY);
    },
    now,
    "DefiLlama indisponível no momento",
  );

// ---------- histórico guardado (cresce a cada dia) ----------

const STORE = "market:store:v1";
type Store = Record<string, Partial<Record<MarketId | "ASI", number>>>;

function readStore(db: Db): Store {
  return readCache<Store>(db, STORE)?.data ?? {};
}

/** Guarda os dias calculados (e o OTHERS do dia); mantém ~3 anos. */
function saveStore(db: Db, store: Store, now: Date) {
  const keep = now.getTime() - 1100 * DAY;
  const pruned = Object.fromEntries(Object.entries(store).filter(([d]) => Number(d) >= keep));
  writeCache(db, STORE, pruned, YEARS, now);
}

const fromStore = (store: Store, id: MarketId | "ASI"): Pt[] =>
  Object.entries(store)
    .filter(([, v]) => typeof v[id] === "number")
    .map(([d, v]): Pt => [Number(d), v[id] as number])
    .sort((a, b) => a[0] - b[0]);

// ---------- montagem ----------

export type MarketData = {
  series: Record<MarketId, Pt[]>;
  current: Record<MarketId, number | null>;
  /** Desde quando há histórico de cada série. */
  since: Record<MarketId, number | null>;
  updated: number | null;
  stale: boolean;
  notes: string[];
};

export type AltseasonData = { latest: AltseasonLatest | null; history: Pt[]; stale: boolean };

async function marketParts(db: Db, now: Date) {
  // CoinMarketCap em sequência (a cota sem chave é pequena); as outras fontes em paralelo.
  const others = Promise.all([caps(db, now), stables(db, now)]);
  const g = await cmcGlobal(db, now);
  const l = await cmcListings(db, now);
  const h = await altHistory(db, now);
  const a = await altLatest(db, now);
  const [c, s] = await others;
  return { g, l, h, c, s, a };
}

function assembleMarket(db: Db, p: Awaited<ReturnType<typeof marketParts>>, now: Date): Part<MarketData> {
  const { g, l, h, c, s } = p;
  if (!g.ok) return g;
  const store = readStore(db);
  const notes: string[] = [];
  const derived =
    h.ok && c.ok
      ? buildAggregates({ alt: h.data.alt, btc: c.data.btc, eth: c.data.eth, usdt: c.data.usdt, usdc: c.data.usdc, stables: s.ok ? s.data : [] })
      : {};
  if (!h.ok || !c.ok) notes.push("Histórico recente indisponível agora (CoinMarketCap/Coin Metrics); mostrando os dias já guardados.");
  if (!s.ok) notes.push("DefiLlama indisponível: dominância das stablecoins sem atualização do histórico.");
  // Guarda os dias calculados (não os valores do momento, que mudam durante o dia — exceto OTHERS e ASI).
  for (const id of MARKET_IDS) for (const [t, v] of derived[id] ?? []) (store[String(dayStart(t))] ??= {})[id] = v;
  if (h.ok) for (const [t, v] of h.data.index) (store[String(dayStart(t))] ??= {}).ASI = v;
  const coins = l.ok ? l.data : [];
  const total = g.data.total;
  const bySym = (sym: string) => coins.find((x) => x.symbol === sym)?.marketCap ?? null;
  const btcCap = bySym("BTC");
  const ethCap = bySym("ETH");
  const alt = g.data.alt ?? (btcCap !== null ? total - btcCap : null);
  const others = othersCap(total, coins);
  if (others !== null) (store[String(dayStart(now.getTime()))] ??= {}).OTHERS = others;
  saveStore(db, store, now);
  const lastStable = s.ok ? (s.data.at(-1)?.[1] ?? null) : null;
  const pct = (v: number | null) => (v === null ? null : (v / total) * 100);
  const current: Record<MarketId, number | null> = {
    TOTAL: total,
    TOTAL2: alt,
    TOTAL3: alt !== null && ethCap !== null ? alt - ethCap : null,
    OTHERS: others,
    "BTC.D": g.data.btcD,
    "ETH.D": g.data.ethD,
    "USDT.D": pct(bySym("USDT")),
    "USDC.D": pct(bySym("USDC")),
    "STABLE.D": pct(lastStable),
  };
  const series = {} as Record<MarketId, Pt[]>;
  const since = {} as Record<MarketId, number | null>;
  for (const id of MARKET_IDS) {
    const hist = mergeDaily(fromStore(store, id), derived[id] ?? []);
    const cur = current[id];
    // O valor de agora entra como último ponto (horário real da consulta), sem substituir os dias fechados.
    const pts = cur !== null && (!hist.length || hist[hist.length - 1][0] < now.getTime()) ? [...hist, [now.getTime(), cur] as Pt] : hist;
    series[id] = pts;
    since[id] = pts[0]?.[0] ?? null;
  }
  return { ok: true, data: { series, current, since, updated: g.data.updated ?? g.at, stale: g.stale, notes }, stale: g.stale, at: g.at };
}

/** Série de um instrumento de mercado (Gráficos e Comparar). */
export async function getMarketSeries(db: Db, id: MarketId, now = new Date()): Promise<{ points: Pt[]; since: number | null; note?: string }> {
  const m = assembleMarket(db, await marketParts(db, now), now);
  if (!m.ok) throw new Error(m.error);
  return { points: m.data.series[id], since: m.data.since[id], ...(m.data.notes.length ? { note: m.data.notes.join(" ") } : {}) };
}

// ---------- on-chain ----------

export type OnchainItem = {
  id: OnchainId;
  ok: boolean;
  error?: string;
  /** Último ano (para os gráficos da página). */
  points: Pt[];
  last: Pt | null;
  source?: string;
  stale?: boolean;
  note?: string;
  reading: Reading | null;
};

export type ModelItem = { id: string; name: string; state: string; tone: "up" | "down" | "neutral" | "na"; detail: string; source: string };

export type OnchainData = { items: OnchainItem[]; consolidated: Consolidated; models: ModelItem[]; price: Pt[] };

async function onchain(db: Db, now: Date): Promise<OnchainData> {
  const price = await btcPrice(db, now);
  const prices = price.ok ? price.data : [];
  const results = await Promise.allSettled(ONCHAIN_IDS.map((id) => getOnchainSeries(db, id, now)));
  const cut = now.getTime() - 400 * DAY;
  const items: OnchainItem[] = ONCHAIN_IDS.map((id, i) => {
    const r = results[i];
    if (r.status === "rejected") return { id, ok: false, error: r.reason instanceof Error ? r.reason.message : "Dados indisponíveis", points: [], last: null, reading: null };
    const pts = r.value.points as Pt[];
    return {
      id,
      ok: pts.length > 0,
      ...(pts.length ? {} : { error: "Sem dados" }),
      points: pts.filter(([t]) => t >= cut),
      last: pts.at(-1) ?? null,
      source: r.value.source,
      stale: r.value.stale,
      note: r.value.note,
      reading: pts.length ? classify(id, pts, prices) : null,
    };
  });
  const consolidated = consolidate(Object.fromEntries(items.map((x) => [x.id, x.reading])), ONCHAIN_SERIES.length);
  const models: ModelItem[] = [];
  const pi = prices.length ? piCycle(prices) : null;
  const usd = (v: number) => `US$ ${Math.round(v).toLocaleString("pt-BR")}`;
  models.push(
    pi
      ? {
          id: "pi",
          name: "Pi Cycle Top",
          state: pi.crossedRecently ? "Cruzamento recente" : pi.fast > pi.slow ? "Acima (sinal ativo)" : "Sem sinal",
          tone: pi.crossedRecently || pi.fast > pi.slow ? "down" : "neutral",
          detail: `Média 111d ${usd(pi.fast)} × 2×média 350d ${usd(pi.slow)} (${pi.distancePct.toFixed(1)}%). Cruzamento para cima marcou topos de ciclos anteriores.`,
          source: "Cálculo próprio · preço diário (Coin Metrics)",
        }
      : { id: "pi", name: "Pi Cycle Top", state: "Indisponível", tone: "na", detail: price.ok ? "Histórico insuficiente." : price.error, source: "Coin Metrics" },
  );
  const band = prices.length ? bullBand(prices) : null;
  models.push(
    band
      ? {
          id: "bmsb",
          name: "Bull Market Support Band",
          state: band.state,
          tone: band.state === "Acima" ? "up" : band.state === "Abaixo" ? "down" : "neutral",
          detail: `SMA 20 semanas ${usd(band.sma20w)} · EMA 21 semanas ${usd(band.ema21w)} · BTC ${usd(band.price)}.`,
          source: "Cálculo próprio · fechamentos semanais (Coin Metrics)",
        }
      : { id: "bmsb", name: "Bull Market Support Band", state: "Indisponível", tone: "na", detail: price.ok ? "Histórico insuficiente." : price.error, source: "Coin Metrics" },
  );
  models.push(
    {
      id: "cycle-master",
      name: "Bitcoin Cycle Master",
      state: "Indisponível",
      tone: "na",
      detail: "Modelo proprietário (combina várias métricas com pesos não publicados): não dá para reproduzir de forma verificável.",
      source: "—",
    },
    {
      id: "power-law",
      name: "Power Law Corridor",
      state: "Indisponível",
      tone: "na",
      detail: "Os parâmetros do corredor (Capriole) não são públicos de forma verificável; não foi implementado para não inventar números.",
      source: "—",
    },
    {
      id: "cme",
      name: "CME Gap Finder",
      state: "Indisponível",
      tone: "na",
      detail: "Exige as velas do contrato futuro de Bitcoin da CME, que não têm fonte gratuita autorizada.",
      source: "—",
    },
  );
  return { items, consolidated, models, price: prices.filter(([t]) => t >= cut) };
}

// ---------- ETFs ----------

export type EtfData = {
  total: EtfDaily[];
  funds: FundSummary[];
  /** Fluxo diário por ETF (últimos ~90 dias guardados). */
  byFund: Record<string, [number, number][]>;
  reading: EtfReading;
  lastDate: string | null;
};

const ETF_STORE = "market:etf:store:v1";

async function etf(db: Db, now: Date): Promise<Part<EtfData> & { configured: boolean }> {
  const key = process.env.SOSOVALUE_API_KEY;
  if (!key || !/^[A-Za-z0-9_-]{8,128}$/.test(key)) {
    return { ok: false, configured: false, error: "Fonte não configurada: os fluxos dos ETFs vêm da SoSoValue, que exige uma chave (SOSOVALUE_API_KEY no servidor)." };
  }
  const headers = { "x-soso-api-key": key };
  const get = (path: string, label: string) => fetchJsonCapped(`${sosoBase()}${path}`, 3_000_000, label, 20_000, headers);
  const summary = await part<EtfDaily[]>(db, "market:etf:summary:v1", 3 * HOUR, async () => parseEtfSummary(await get("/etfs/summary-history?symbol=BTC&country_code=US&limit=300", "SoSoValue")), now, "SoSoValue indisponível no momento");
  if (!summary.ok) return { ...summary, configured: true };
  const list = await part<{ ticker: string; name: string }[]>(db, "market:etf:list:v1", 24 * HOUR, async () => parseEtfList(await get("/etfs?symbol=BTC&country_code=US", "SoSoValue")), now, "Lista de ETFs indisponível");
  const funds = list.ok ? list.data.slice(0, 20) : [];
  // Histórico de 1 mês por ETF (o máximo da fonte); cada dia fica guardado, para chegar a 90 dias com o tempo.
  const stored = readCache<Record<string, Record<string, EtfFundRow>>>(db, ETF_STORE)?.data ?? {};
  const fetched = await Promise.all(
    funds.map((f) => part<EtfFundRow[]>(db, `market:etf:hist:${f.ticker}:v1`, 3 * HOUR, async () => parseEtfHistory(await get(`/etfs/${encodeURIComponent(f.ticker)}/history`, "SoSoValue"), f.ticker), now, "")),
  );
  fetched.forEach((r, i) => {
    if (!r.ok) return;
    const m = (stored[funds[i].ticker] ??= {});
    for (const row of r.data) m[row.date] = row;
  });
  const keep = iso(now.getTime() - 120 * DAY);
  for (const m of Object.values(stored)) for (const d of Object.keys(m)) if (d < keep) delete m[d];
  writeCache(db, ETF_STORE, stored, YEARS, now);
  const summaries = funds.map((f) => summarizeFund(f.ticker, f.name, Object.values(stored[f.ticker] ?? {})));
  const byFund = Object.fromEntries(funds.map((f) => [f.ticker, Object.values(stored[f.ticker] ?? {}).sort((a, b) => a.date.localeCompare(b.date)).map((r): [number, number] => [Date.parse(`${r.date}T00:00:00Z`), r.netInflow ?? 0])]));
  return {
    ok: true,
    configured: true,
    stale: summary.stale,
    at: summary.at,
    data: { total: summary.data, funds: summaries.sort((a, b) => (b.aum ?? 0) - (a.aum ?? 0)), byFund, reading: readFlows(summary.data, summaries), lastDate: summary.data.at(-1)?.date ?? null },
  };
}

// ---------- página ----------

export type CryptoOverview = {
  now: number;
  market: Part<MarketData>;
  altseason: Part<AltseasonData>;
  coins: Part<{ top: CoinRow[]; btc: CoinRow | null; usdt: CoinRow | null }>;
  onchain: OnchainData;
  etf: Part<EtfData> & { configured?: boolean };
};

export async function getCryptoOverview(db: Db, now = new Date()): Promise<CryptoOverview> {
  const [parts, chain, etfs] = await Promise.all([marketParts(db, now), onchain(db, now), etf(db, now)]);
  const market = assembleMarket(db, parts, now);
  const store = readStore(db);
  const asiHist = mergeDaily(fromStore(store, "ASI"), parts.h.ok ? parts.h.data.index : []);
  const altseason: Part<AltseasonData> =
    parts.a.ok || asiHist.length
      ? {
          ok: true,
          data: { latest: parts.a.ok ? parts.a.data : null, history: asiHist, stale: parts.a.ok ? parts.a.stale : true },
          stale: parts.a.ok ? parts.a.stale : true,
          at: parts.a.ok ? parts.a.at : now.getTime(),
        }
      : { ok: false, error: parts.a.ok ? "Índice indisponível" : parts.a.error };
  const coins: CryptoOverview["coins"] = parts.l.ok
    ? { ok: true, stale: parts.l.stale, at: parts.l.at, data: { top: topEligible(parts.l.data, 100), btc: parts.l.data.find((c) => c.symbol === "BTC") ?? null, usdt: parts.l.data.find((c) => c.symbol === "USDT") ?? null } }
    : parts.l;
  return { now: now.getTime(), market, altseason, coins, onchain: chain, etf: etfs };
}
