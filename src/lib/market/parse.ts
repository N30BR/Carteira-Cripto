// Leitura das respostas das fontes da aba Cripto (funções puras; respostas tratadas como não confiáveis).
// Campo ausente ou com formato diferente vira null/erro — nunca outro número no lugar.
import { type CoinRow, type Pt, dayStart } from "./calc";

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const obj = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const time = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  if (typeof v !== "string") return null;
  const t = /^\d+$/.test(v) ? Number(v) * (v.length <= 10 ? 1000 : 1) : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

// ---------- CoinMarketCap (API pública sem chave) ----------

export type CmcGlobal = {
  total: number;
  /** Market cap das altcoins (total − BTC) = TOTAL2. */
  alt: number | null;
  btcD: number;
  ethD: number | null;
  btcDYesterday: number | null;
  ethDYesterday: number | null;
  totalYesterday: number | null;
  stableCap: number | null;
  updated: number | null;
};

export function parseCmcGlobal(json: unknown): CmcGlobal {
  const d = obj(obj(json)?.data);
  const usd = obj(obj(d?.quote)?.USD);
  const total = num(usd?.total_market_cap);
  const btcD = num(d?.btc_dominance);
  if (total === null || !(total > 0) || btcD === null) throw new Error("CoinMarketCap: resposta inesperada (mercado global)");
  return {
    total,
    alt: num(usd?.altcoin_market_cap),
    btcD,
    ethD: num(d?.eth_dominance),
    btcDYesterday: num(d?.btc_dominance_yesterday),
    ethDYesterday: num(d?.eth_dominance_yesterday),
    totalYesterday: num(usd?.total_market_cap_yesterday),
    stableCap: num(usd?.stablecoin_market_cap),
    updated: time(usd?.last_updated ?? d?.last_updated),
  };
}

export function parseCmcListings(json: unknown): CoinRow[] {
  const data = obj(json)?.data;
  if (!Array.isArray(data)) throw new Error("CoinMarketCap: resposta inesperada (listagem)");
  const out: CoinRow[] = [];
  for (const r of data) {
    const c = obj(r);
    const q = obj(obj(c?.quote)?.USD);
    const id = num(c?.id);
    const rank = num(c?.cmc_rank);
    const mcap = num(q?.market_cap);
    const price = num(q?.price);
    if (id === null || rank === null || mcap === null || price === null || typeof c?.symbol !== "string" || typeof c?.name !== "string") continue;
    out.push({
      id,
      rank,
      name: c.name.slice(0, 60),
      symbol: c.symbol.slice(0, 20),
      marketCap: mcap,
      price,
      tags: Array.isArray(c.tags) ? c.tags.filter((t): t is string => typeof t === "string").slice(0, 60) : [],
      change: { "1D": num(q?.percent_change_24h), "7D": num(q?.percent_change_7d), "30D": num(q?.percent_change_30d), "90D": num(q?.percent_change_90d) },
    });
  }
  if (!out.length) throw new Error("CoinMarketCap: listagem vazia");
  return out.sort((a, b) => a.rank - b.rank);
}

export type AltseasonLatest = { index: number; altCap: number | null; at: number | null; yearlyHigh: number | null; yearlyHighDate: string | null; yearlyLow: number | null; yearlyLowDate: string | null };

export function parseAltseasonLatest(json: unknown): AltseasonLatest {
  const d = obj(obj(json)?.data);
  const index = num(d?.altcoin_index);
  if (index === null || index < 0 || index > 100) throw new Error("CoinMarketCap: índice de altseason inesperado");
  const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
  return {
    index,
    altCap: num(d?.altcoin_marketcap),
    at: time(d?.snapshot_time),
    yearlyHigh: num(d?.yearly_high),
    yearlyHighDate: date(d?.yearly_high_date),
    yearlyLow: num(d?.yearly_low),
    yearlyLowDate: date(d?.yearly_low_date),
  };
}

/** Histórico do índice (pontos diários às 00:00 UTC) e o market cap das altcoins de cada ponto. */
export function parseAltseasonHistory(json: unknown): { index: Pt[]; alt: Pt[] } {
  const points = obj(obj(json)?.data)?.points;
  if (!Array.isArray(points)) throw new Error("CoinMarketCap: histórico de altseason inesperado");
  const index: Pt[] = [];
  const alt: Pt[] = [];
  for (const p of points) {
    const o = obj(p);
    const t = time(o?.timestamp);
    if (t === null) continue;
    const i = num(o?.altcoin_index);
    const a = num(o?.altcoin_marketcap);
    if (i !== null && i >= 0 && i <= 100) index.push([t, i]);
    if (a !== null && a > 0) alt.push([t, a]);
  }
  return { index: index.sort((x, y) => x[0] - y[0]), alt: alt.sort((x, y) => x[0] - y[0]) };
}

// ---------- Coin Metrics (API comunitária) ----------

/** asset-metrics de vários ativos → { ativo: { métrica: pontos } } (data = dia do fechamento, como a fonte marca). */
export function parseCoinMetricsMulti(json: unknown, metrics: string[]): Record<string, Record<string, Pt[]>> {
  const data = obj(json)?.data;
  if (!Array.isArray(data)) throw new Error("Coin Metrics: resposta inesperada");
  const out: Record<string, Record<string, Pt[]>> = {};
  for (const r of data) {
    const o = obj(r);
    const t = time(o?.time);
    if (!o || t === null || typeof o.asset !== "string") continue;
    for (const m of metrics) {
      const v = num(o[m]);
      if (v === null) continue;
      ((out[o.asset] ??= {})[m] ??= []).push([t, v]);
    }
  }
  for (const a of Object.values(out)) for (const m of Object.keys(a)) a[m].sort((x, y) => x[0] - y[0]);
  return out;
}

// ---------- DefiLlama (stablecoins) ----------

/** stablecoincharts: soma de todas as moedas de lastro (peggedUSD, peggedEUR, ...) em US$, por dia. */
export function parseLlamaStables(json: unknown): Pt[] {
  if (!Array.isArray(json)) throw new Error("DefiLlama: resposta inesperada");
  const out: Pt[] = [];
  for (const r of json) {
    const o = obj(r);
    const t = time(o?.date);
    const usd = obj(o?.totalCirculatingUSD);
    if (t === null || !usd) continue;
    let sum = 0;
    let any = false;
    for (const v of Object.values(usd)) {
      const n = num(v);
      if (n !== null && n >= 0) {
        sum += n;
        any = true;
      }
    }
    if (any) out.push([dayStart(t), sum]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

// ---------- SoSoValue (ETFs; exige chave) ----------

export type EtfDaily = { date: string; netInflow: number | null; netAssets: number | null; cumInflow: number | null; valueTraded: number | null };
export type EtfFundRow = EtfDaily & { ticker: string };

const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v).toISOString().slice(0, 10) : null);
/** As respostas podem vir direto ou dentro de { data } (envelope). */
const listOf = (json: unknown): unknown[] | null => (Array.isArray(json) ? json : Array.isArray(obj(json)?.data) ? (obj(json)!.data as unknown[]) : null);

/** /etfs/summary-history: total de todos os ETFs por dia. */
export function parseEtfSummary(json: unknown): EtfDaily[] {
  const list = listOf(json);
  if (!list) throw new Error("SoSoValue: resposta inesperada (resumo)");
  const out: EtfDaily[] = [];
  for (const r of list) {
    const o = obj(r);
    const date = isoDate(o?.date);
    if (!date) continue;
    out.push({ date, netInflow: num(o?.total_net_inflow), netAssets: num(o?.total_net_assets), cumInflow: num(o?.cum_net_inflow), valueTraded: num(o?.total_value_traded) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** /etfs: lista de ETFs (ticker e nome). */
export function parseEtfList(json: unknown): { ticker: string; name: string }[] {
  const list = listOf(json);
  if (!list) throw new Error("SoSoValue: resposta inesperada (lista)");
  return list
    .map((r) => obj(r))
    .filter((o): o is Record<string, unknown> => !!o && typeof o.ticker === "string" && /^[A-Z0-9.]{1,10}$/.test(o.ticker))
    .map((o) => ({ ticker: o.ticker as string, name: typeof o.name === "string" ? o.name.slice(0, 80) : (o.ticker as string) }));
}

/** /etfs/{ticker}/history: a linha mais recente ainda não liquidada (fluxo nulo) fica de fora. */
export function parseEtfHistory(json: unknown, ticker: string): EtfFundRow[] {
  const list = listOf(json);
  if (!list) throw new Error("SoSoValue: resposta inesperada (histórico)");
  const out: EtfFundRow[] = [];
  for (const r of list) {
    const o = obj(r);
    const date = isoDate(o?.date);
    const netInflow = num(o?.net_inflow);
    if (!date || netInflow === null) continue;
    out.push({ ticker, date, netInflow, netAssets: num(o?.net_assets), cumInflow: num(o?.cum_inflow), valueTraded: num(o?.value_traded) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
