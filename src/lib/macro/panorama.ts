// Panorama Macro (servidor): busca as fontes, guarda em cache no banco e monta as seções da página.
// Só dados reais das fontes; o que não tem fonte gratuita confiável aparece como indisponível (com o motivo).
//
// Fontes:
// - Câmbio: taxas de referência do BCE (Frankfurter, sem chave), uma por dia útil.
// - Juros: FRED (Fed: faixa-alvo; BCE: taxa de depósito); BoJ: API oficial do Banco do Japão (taxa call
//   overnight sem garantia, a taxa que a política do BoJ tem como meta).
// - M2: FRED (EUA), Banco do Japão e BCE (Zona do Euro), convertidos para US$ pelo câmbio médio do mês do BCE.
// - Indicadores e bolsas: FRED (Treasuries, VIX, spread high yield, curva, S&P 500, Nasdaq 100, Dow, Nikkei);
//   DXY calculado pela fórmula da ICE com o câmbio do BCE.
// - Ativos: Binance (BTC à vista; ouro, prata, Brent, WTI e gás natural pelos contratos perpétuos, que seguem o
//   mercado à vista).
import type { Db } from "@/db/client";
import { cached } from "@/lib/prices/cache";
import { fetchCloses } from "@/lib/prices/binance";
import { fredSeries } from "@/lib/charts/macro";
import { fetchJsonCapped, fetchTextCapped } from "@/lib/http";
import {
  dxySeries,
  lastChange,
  lastDecision,
  monthlyAverage,
  parseBojSeries,
  parseEcbCsv,
  parseFrankfurterSeries,
  pctChangeOver,
  sumByMonth,
  tail,
  thin,
  toUsdTrillions,
  valueAt,
  yoy,
  type Point,
} from "./calc";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Um número do painel (ou o motivo de não ter). */
export type MacroItem = {
  id: string;
  label: string;
  /** Linha de apoio (ex.: nome da moeda, taxa usada, fonte). */
  sub?: string;
  /** Unidade do valor (%, pts, US$ tri...). */
  unit: string;
  value: number | null;
  /** Valor formatado de outra forma (ex.: faixa-alvo do Fed "3,75–4,00"). */
  display?: string;
  change: number | null;
  /** % = variação percentual; pp = pontos percentuais; pts = pontos. */
  changeKind: "pct" | "pp" | "pts";
  /** Rótulo da variação (ex.: "1D", "a/a", "vs. decisão anterior"). */
  changeLabel?: string;
  /** Data do dado (ms). */
  asOf: number | null;
  /** Data da última decisão (taxas). */
  decidedAt?: number | null;
  spark: Point[];
  /** Até ~1 ano de histórico (diário, leve): a página calcula variação e minigráfico do período escolhido. */
  history?: Point[];
  /** Sigla do país/região (US, EU, JP, CN, BR; GL = global). */
  flag?: string;
  /** Indisponível: motivo. */
  unavailable?: string;
  note?: string;
};

export type AssetRow = {
  id: string;
  name: string;
  ticker: string;
  /** Unidade física do preço (por onça, por barril...). */
  per: string;
  /** Preço em US$ (a página converte para a moeda escolhida). */
  usd: number | null;
  changes: Record<"1D" | "1S" | "1M" | "3M" | "6M" | "1A", number | null>;
  /** Minigráfico de 1 dia (horário) e de até 1 ano (diário), em US$. */
  sparkDay: Point[];
  sparkYear: Point[];
  source: string;
  unavailable?: string;
};

export type Panorama = {
  fx: MacroItem[];
  rates: MacroItem[];
  liquidity: MacroItem[];
  liquidityNote: string;
  indicators: MacroItem[];
  markets: MacroItem[];
  assets: AssetRow[];
  /** 1 USD em cada moeda (EUR, JPY, BRL) e em BTC, para converter os preços dos ativos. */
  usdIn: { EUR: number | null; JPY: number | null; BRL: number | null; BTC: number | null };
  fetchedAt: number;
};

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const fail = (e: unknown) => (e instanceof Error ? e.message : "indisponível");

// ---------- fontes (com cache) ----------

/** Câmbio do BCE: ~2 anos de taxas diárias de 1 USD em cada moeda (para conversões mensais e o DXY). */
async function fxSeries(db: Db, now: Date): Promise<Record<string, Point[]>> {
  const from = iso(now.getTime() - 800 * DAY);
  const r = await cached(
    db,
    "macro:fx:v1",
    3 * HOUR,
    async () => {
      const base = process.env.FRANKFURTER_BASE_URL ?? "https://api.frankfurter.dev";
      const url = `${base}/v1/${from}..?${new URLSearchParams({ base: "USD", symbols: "EUR,JPY,CNY,BRL,GBP,CAD,SEK,CHF" })}`;
      const fx = parseFrankfurterSeries(await fetchJsonCapped(url, 3_000_000, "Câmbio (BCE)"));
      if (!fx.EUR?.length) throw new Error("Câmbio (BCE): sem dados");
      return fx;
    },
    now,
  );
  if (!r) throw new Error("Câmbio (BCE) indisponível no momento");
  return r.data;
}

async function bojSeries(db: Db, dbName: string, code: string, start: string, now: Date): Promise<Point[]> {
  const r = await cached(
    db,
    `macro:boj:${code}:v1`,
    12 * HOUR,
    async () => {
      const url = `https://www.stat-search.boj.or.jp/api/v1/getDataCode?${new URLSearchParams({ format: "json", lang: "en", db: dbName, code, startDate: start })}`;
      const pts = parseBojSeries(await fetchJsonCapped(url, 3_000_000, "Banco do Japão"));
      if (!pts.length) throw new Error("Banco do Japão: sem dados");
      return pts;
    },
    now,
  );
  if (!r) throw new Error("Banco do Japão indisponível no momento");
  return r.data;
}

async function ecbM2(db: Db, now: Date): Promise<Point[]> {
  const r = await cached(
    db,
    "macro:ecb:m2:v1",
    12 * HOUR,
    async () => {
      const start = iso(now.getTime() - 3 * 365 * DAY).slice(0, 7);
      const url = `https://data-api.ecb.europa.eu/service/data/BSI/M.U2.Y.V.M20.X.1.U2.2300.Z01.E?${new URLSearchParams({ format: "csvdata", startPeriod: start })}`;
      const pts = parseEcbCsv(await fetchTextCapped(url, 2_000_000, "BCE"));
      if (!pts.length) throw new Error("BCE: sem dados");
      return pts;
    },
    now,
  );
  if (!r) throw new Error("BCE indisponível no momento");
  return r.data;
}

async function closes(db: Db, symbol: string, interval: "1h" | "1d", limit: number, futures: boolean, now: Date): Promise<Point[]> {
  const r = await cached(db, `macro:bn:${futures ? "f" : "s"}:${symbol}:${interval}:v1`, 5 * 60_000, () => fetchCloses(symbol, interval, limit, futures), now);
  if (!r || !r.data.length) throw new Error("Binance indisponível no momento");
  return r.data;
}

// ---------- seções ----------

const unavailableItem = (base: Omit<MacroItem, "value" | "change" | "asOf" | "spark">, reason: string): MacroItem => ({
  ...base,
  value: null,
  change: null,
  asOf: null,
  spark: [],
  unavailable: reason,
});

function fxSection(fx: Record<string, Point[]> | null, err: string): MacroItem[] {
  const defs = [
    { id: "EUR", label: "EUR/USD", sub: "Euro — US$ por 1 euro", flag: "EU", invert: true },
    { id: "JPY", label: "USD/JPY", sub: "Iene — ienes por 1 US$", flag: "JP", invert: false },
    { id: "CNY", label: "USD/CNY", sub: "Yuan — yuans por 1 US$", flag: "CN", invert: false },
    { id: "BRL", label: "USD/BRL", sub: "Real — reais por 1 US$", flag: "BR", invert: false },
  ];
  const dxy = fx ? dxySeries(fx) : [];
  const usd: MacroItem = dxy.length
    ? {
        id: "USD",
        label: "USD (DXY)",
        sub: "Dólar — índice contra 6 moedas",
        flag: "US",
        unit: "pts",
        value: dxy.at(-1)![1],
        change: lastChange(dxy, "pct"),
        changeKind: "pct",
        changeLabel: "1D",
        asOf: dxy.at(-1)![0],
        spark: tail(dxy, 90),
        history: thin(tail(dxy, 370), 260),
      }
    : unavailableItem({ id: "USD", label: "USD (DXY)", sub: "Dólar", flag: "US", unit: "pts", changeKind: "pct" }, err);
  return [
    usd,
    ...defs.map((d) => {
      const raw = fx?.[d.id];
      if (!raw?.length) return unavailableItem({ id: d.id, label: d.label, sub: d.sub, flag: d.flag, unit: "", changeKind: "pct" }, err);
      const s = d.invert ? raw.map(([t, v]) => [t, 1 / v] as Point) : raw;
      return {
        id: d.id,
        label: d.label,
        sub: d.sub,
        flag: d.flag,
        unit: "",
        value: s.at(-1)![1],
        change: lastChange(s, "pct"),
        changeKind: "pct" as const,
        changeLabel: "1D",
        asOf: s.at(-1)![0],
        spark: tail(s, 90),
        history: thin(tail(s, 370), 260),
      };
    }),
  ];
}

async function ratesSection(db: Db, now: Date): Promise<MacroItem[]> {
  const step = async (id: string, label: string, sub: string, flag: string, seriesId: string, lower?: string): Promise<MacroItem> => {
    try {
      const [s, lo] = await Promise.all([fredSeries(db, seriesId, now), lower ? fredSeries(db, lower, now) : Promise.resolve(null)]);
      const last = s.at(-1)!;
      const dec = lastDecision(s);
      const loV = lo?.at(-1)?.[1];
      return {
        id,
        label,
        sub,
        flag,
        unit: "%",
        value: last[1],
        ...(loV !== undefined ? { display: `${fmt2(loV)}–${fmt2(last[1])}` } : {}),
        change: dec?.change ?? 0,
        changeKind: "pp",
        changeLabel: "vs. decisão anterior",
        asOf: last[0],
        decidedAt: dec?.at ?? null,
        spark: tail(s, 3 * 365),
      };
    } catch (e) {
      return unavailableItem({ id, label, sub, flag, unit: "%", changeKind: "pp" }, fail(e));
    }
  };
  const boj = async (): Promise<MacroItem> => {
    const base = { id: "BOJ", label: "BoJ", sub: "Japão — taxa call overnight sem garantia (meta da política)", flag: "JP", unit: "%", changeKind: "pp" as const };
    try {
      const start = iso(now.getTime() - 3 * 365 * DAY).slice(0, 7).replace("-", "");
      const s = await bojSeries(db, "FM01", "STRDCLUCON", start, now);
      const last = s.at(-1)!;
      // Taxa de mercado em volta da meta: mudanças de 0,1 p.p. ou mais são decisões (as metas mudam de 0,25 p.p.).
      const dec = lastDecision(s, 0.1);
      return {
        ...base,
        value: last[1],
        change: dec?.change ?? 0,
        changeLabel: "vs. decisão anterior",
        asOf: last[0],
        decidedAt: dec?.at ?? null,
        spark: thin(tail(s, 3 * 365), 160),
        note: "Média diária da taxa call (fica perto da meta do BoJ).",
      };
    } catch (e) {
      return unavailableItem(base, fail(e));
    }
  };
  return Promise.all([
    step("FED", "FED", "Estados Unidos — faixa-alvo dos Fed Funds", "US", "DFEDTARU", "DFEDTARL"),
    step("BCE", "BCE", "Zona do Euro — taxa de depósito", "EU", "ECBDFR"),
    boj(),
  ]);
}

async function liquiditySection(db: Db, fx: Record<string, Point[]> | null, now: Date): Promise<MacroItem[]> {
  const eurAvg = fx?.EUR ? monthlyAverage(fx.EUR) : null;
  const jpyAvg = fx?.JPY ? monthlyAverage(fx.JPY) : null;
  const start = iso(now.getTime() - 3 * 365 * DAY);
  const results = await Promise.allSettled([
    fredSeries(db, "M2SL", now).then((s) => s.filter(([t]) => t >= Date.parse(start))),
    bojSeries(db, "MD02", "MAM1NAM2M2MO", start.slice(0, 7).replace("-", ""), now),
    ecbM2(db, now),
  ]);
  const [usRaw, jpRaw, euRaw] = results.map((r) => (r.status === "fulfilled" ? r.value : null));
  const why = (i: number) => (results[i].status === "rejected" ? fail((results[i] as PromiseRejectedResult).reason) : "sem dados");
  // Em trilhões de US$: EUA em bilhões de US$; Japão em 100 milhões de ienes; Zona do Euro em milhões de euros.
  const us = usRaw ? toUsdTrillions(usRaw, 1e9, null) : null;
  const jp = jpRaw && jpyAvg ? toUsdTrillions(jpRaw, 1e8, jpyAvg) : null;
  const eu = euRaw && eurAvg ? toUsdTrillions(euRaw, 1e6, eurAvg) : null;
  const item = (id: string, label: string, sub: string, flag: string, usd: Point[] | null, local: Point[] | null, reason: string): MacroItem =>
    usd?.length
      ? {
          id,
          label,
          sub,
          flag,
          unit: "US$ tri",
          value: usd.at(-1)![1],
          // Variação anual na moeda local (sem o efeito do câmbio).
          change: yoy(local ?? usd),
          changeKind: "pct",
          changeLabel: "a/a",
          asOf: usd.at(-1)![0],
          spark: usd,
        }
      : unavailableItem({ id, label, sub, flag, unit: "US$ tri", changeKind: "pct" }, reason);
  const parts = [us, jp, eu].filter((p): p is Point[] => !!p?.length);
  const global = parts.length === 3 ? sumByMonth(parts) : null;
  return [
    item("US", "EUA (M2)", "Federal Reserve — dessazonalizado", "US", us, usRaw, why(0)),
    item("JP", "Japão (M2)", "Banco do Japão — saldo médio", "JP", jp, jpRaw, jpRaw ? "câmbio indisponível" : why(1)),
    item("EU", "Zona do Euro (M2)", "BCE — dessazonalizado", "EU", eu, euRaw, euRaw ? "câmbio indisponível" : why(2)),
    global?.length
      ? { ...item("GLOBAL", "Liquidez Global (M2)", "EUA + Japão + Zona do Euro, em US$", "GL", global, null, ""), change: yoy(global), changeLabel: "a/a (em US$)" }
      : unavailableItem({ id: "GLOBAL", label: "Liquidez Global (M2)", sub: "EUA + Japão + Zona do Euro", flag: "GL", unit: "US$ tri", changeKind: "pct" }, "Falta algum dos componentes no momento."),
  ];
}

const LIQUIDITY_NOTE =
  "M2 de cada país na definição do próprio banco central (EUA: Fed, dessazonalizado; Japão: BoJ, saldo médio; Zona do Euro: BCE, dessazonalizado), " +
  "convertido para US$ pela média mensal da taxa de referência do BCE. A Liquidez Global soma esses três só nos meses em que os três já foram " +
  "divulgados (as definições de M2 não são idênticas entre países). A variação a/a de cada " +
  "país é na moeda local; a do total é em US$. Não é a liquidez líquida dos bancos centrais (balanços).";

async function fredItem(
  db: Db,
  now: Date,
  def: { id: string; label: string; sub: string; seriesId: string; unit: string; changeKind: "pct" | "pp" | "pts"; flag?: string; note?: string },
): Promise<MacroItem> {
  try {
    const s = await fredSeries(db, def.seriesId, now);
    const last = s.at(-1)!;
    return {
      id: def.id,
      label: def.label,
      sub: def.sub,
      flag: def.flag,
      unit: def.unit,
      value: last[1],
      change: lastChange(s, def.changeKind === "pct" ? "pct" : "diff"),
      changeKind: def.changeKind,
      changeLabel: "1D",
      asOf: last[0],
      spark: tail(s, 90),
      history: thin(tail(s, 370), 260),
      ...(def.note ? { note: def.note } : {}),
    };
  } catch (e) {
    return unavailableItem({ id: def.id, label: def.label, sub: def.sub, flag: def.flag, unit: def.unit, changeKind: def.changeKind }, fail(e));
  }
}

async function indicatorsSection(db: Db, fx: Record<string, Point[]> | null, fxErr: string, now: Date): Promise<MacroItem[]> {
  const dxy = fx ? dxySeries(fx) : [];
  const dxyItem: MacroItem = dxy.length
    ? {
        id: "DXY",
        label: "DXY",
        sub: "Índice do dólar americano",
        unit: "pts",
        value: dxy.at(-1)![1],
        change: lastChange(dxy, "pct"),
        changeKind: "pct",
        changeLabel: "1D",
        asOf: dxy.at(-1)![0],
        spark: tail(dxy, 90),
        note: "Calculado pela fórmula da ICE com as taxas de referência do BCE (não é a cotação do contrato da ICE).",
      }
    : unavailableItem({ id: "DXY", label: "DXY", sub: "Índice do dólar americano", unit: "pts", changeKind: "pct" }, fxErr);
  const rest = await Promise.all([
    fredItem(db, now, { id: "US10Y", label: "US10Y", sub: "Treasury 10 anos", seriesId: "DGS10", unit: "%", changeKind: "pp" }),
    fredItem(db, now, { id: "US02Y", label: "US02Y", sub: "Treasury 2 anos", seriesId: "DGS2", unit: "%", changeKind: "pp" }),
    fredItem(db, now, { id: "VIX", label: "VIX", sub: "Volatilidade do S&P 500", seriesId: "VIXCLS", unit: "pts", changeKind: "pct" }),
    fredItem(db, now, { id: "HY", label: "High Yield Spread", sub: "Spread de crédito alto rendimento (ICE BofA)", seriesId: "BAMLH0A0HYM2", unit: "p.p.", changeKind: "pp" }),
    fredItem(db, now, { id: "CURVE", label: "Curva 10Y − 2Y", sub: "Treasuries 10 anos − 2 anos", seriesId: "T10Y2Y", unit: "p.p.", changeKind: "pp" }),
  ]);
  return [dxyItem, ...rest];
}

async function marketsSection(db: Db, now: Date): Promise<MacroItem[]> {
  const idx = (id: string, label: string, sub: string, flag: string, seriesId: string) =>
    fredItem(db, now, { id, label, sub, seriesId, unit: "pts", changeKind: "pct", flag });
  const got = await Promise.all([
    idx("SPX", "S&P 500", "Estados Unidos", "US", "SP500"),
    idx("NDX", "Nasdaq 100", "Estados Unidos", "US", "NASDAQ100"),
    idx("DJI", "Dow Jones", "Estados Unidos", "US", "DJIA"),
    idx("N225", "Nikkei 225", "Japão", "JP", "NIKKEI225"),
  ]);
  return got;
}

const ASSETS = [
  { id: "BTC", name: "Bitcoin", ticker: "BTC", symbol: "BTCUSDT", futures: false, per: "por BTC", source: "Binance (à vista)" },
  { id: "XAU", name: "Ouro", ticker: "XAU", symbol: "XAUUSDT", futures: true, per: "por onça troy", source: "Binance (contrato perpétuo)" },
  { id: "XAG", name: "Prata", ticker: "XAG", symbol: "XAGUSDT", futures: true, per: "por onça troy", source: "Binance (contrato perpétuo)" },
  { id: "BRENT", name: "Petróleo Brent", ticker: "BRENT", symbol: "BZUSDT", futures: true, per: "por barril", source: "Binance (contrato perpétuo)" },
  { id: "WTI", name: "Petróleo WTI", ticker: "WTI", symbol: "CLUSDT", futures: true, per: "por barril", source: "Binance (contrato perpétuo)" },
  { id: "NG", name: "Gás Natural", ticker: "NG", symbol: "NATGASUSDT", futures: true, per: "por MMBtu", source: "Binance (contrato perpétuo)" },
] as const;

async function assetsSection(db: Db, now: Date): Promise<AssetRow[]> {
  return Promise.all(
    ASSETS.map(async (a): Promise<AssetRow> => {
      const base = { id: a.id, name: a.name, ticker: a.ticker, per: a.per, source: a.source };
      try {
        const [hours, days] = await Promise.all([closes(db, a.symbol, "1h", 30, a.futures, now), closes(db, a.symbol, "1d", 400, a.futures, now)]);
        const last = hours.at(-1)!;
        const dayAgo = valueAt(hours, last[0] - DAY);
        return {
          ...base,
          usd: last[1],
          changes: {
            "1D": dayAgo && hours[0][0] <= last[0] - DAY + HOUR ? ((last[1] - dayAgo[1]) / dayAgo[1]) * 100 : null,
            "1S": pctChangeOver(days, 7),
            "1M": pctChangeOver(days, 30),
            "3M": pctChangeOver(days, 91),
            "6M": pctChangeOver(days, 182),
            "1A": pctChangeOver(days, 365),
          },
          sparkDay: tail(hours, 1),
          sparkYear: tail(days, 365),
        };
      } catch (e) {
        return {
          ...base,
          usd: null,
          changes: { "1D": null, "1S": null, "1M": null, "3M": null, "6M": null, "1A": null },
          sparkDay: [],
          sparkYear: [],
          unavailable: fail(e),
        };
      }
    }),
  );
}

const fmt2 = (v: number) => v.toFixed(2).replace(".", ",");

/** Tudo da página (cada parte falha sozinha, sem derrubar as outras). */
export async function getPanorama(db: Db, now = new Date()): Promise<Panorama> {
  let fx: Record<string, Point[]> | null = null;
  let fxErr = "Câmbio (BCE) indisponível no momento";
  try {
    fx = await fxSeries(db, now);
  } catch (e) {
    fxErr = fail(e);
  }
  const [rates, liquidity, indicators, markets, assets] = await Promise.all([
    ratesSection(db, now),
    liquiditySection(db, fx, now),
    indicatorsSection(db, fx, fxErr, now),
    marketsSection(db, now),
    assetsSection(db, now),
  ]);
  const btc = assets.find((a) => a.id === "BTC")?.usd ?? null;
  const lastRate = (c: string) => fx?.[c]?.at(-1)?.[1] ?? null;
  return {
    fx: fxSection(fx, fxErr),
    rates,
    liquidity,
    liquidityNote: LIQUIDITY_NOTE,
    indicators,
    markets,
    assets,
    usdIn: { EUR: lastRate("EUR"), JPY: lastRate("JPY"), BRL: lastRate("BRL"), BTC: btc ? 1 / btc : null },
    fetchedAt: now.getTime(),
  };
}
