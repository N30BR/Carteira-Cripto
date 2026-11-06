// Leitura das fontes on-chain e cálculos derivados (funções puras, testadas sem rede).
import type { Point } from "./macro-math";
import type { OnchainId } from "./onchain-ids";

export type CmRow = { t: number; mvrv: number | null; mcap: number | null; supply: number | null; issUsd: number | null; flowIn: number | null; flowOut: number | null };

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Resposta da API comunitária da Coin Metrics (asset-metrics) → linhas diárias. */
export function parseCoinMetrics(json: unknown): CmRow[] {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) throw new Error("Coin Metrics: resposta inesperada");
  const out: CmRow[] = [];
  for (const r of data as Record<string, unknown>[]) {
    const t = typeof r.time === "string" ? Date.parse(r.time) : NaN;
    if (!Number.isFinite(t)) continue;
    out.push({
      t,
      mvrv: num(r.CapMVRVCur),
      mcap: num(r.CapMrktCurUSD),
      supply: num(r.SplyCur),
      issUsd: num(r.IssTotUSD),
      flowIn: num(r.FlowInExNtv),
      flowOut: num(r.FlowOutExNtv),
    });
  }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * Indicadores calculados a partir das métricas gratuitas da Coin Metrics:
 * - valor realizado = valor de mercado ÷ MVRV (identidade do MVRV); preço realizado = valor realizado ÷ oferta;
 * - NUPL = (mercado − realizado) ÷ mercado = 1 − 1/MVRV;
 * - MVRV Z-Score = (mercado − realizado) ÷ desvio-padrão do valor de mercado desde o início até a data;
 * - Puell = emissão diária em US$ ÷ média móvel de 365 dias da emissão;
 * - netflow = entradas − saídas de BTC nas exchanges.
 * Datas sem algum dado ficam de fora (nada é interpolado).
 */
export function deriveCoinMetrics(rows: CmRow[]): Record<"MVRV_Z" | "NUPL" | "REALIZED_PRICE" | "PUELL" | "EXCHANGE_NETFLOW", Point[]> {
  const out = { MVRV_Z: [] as Point[], NUPL: [] as Point[], REALIZED_PRICE: [] as Point[], PUELL: [] as Point[], EXCHANGE_NETFLOW: [] as Point[] };
  // Desvio-padrão acumulado (Welford).
  let n = 0;
  let mean = 0;
  let m2 = 0;
  const iss: number[] = [];
  let issSum = 0;
  for (const r of rows) {
    if (r.mcap !== null) {
      n++;
      const delta = r.mcap - mean;
      mean += delta / n;
      m2 += delta * (r.mcap - mean);
    }
    if (r.mvrv !== null && r.mvrv > 0 && r.mcap !== null) {
      const realized = r.mcap / r.mvrv;
      out.NUPL.push([r.t, 1 - 1 / r.mvrv]);
      if (r.supply !== null && r.supply > 0) out.REALIZED_PRICE.push([r.t, realized / r.supply]);
      const std = n > 1 ? Math.sqrt(m2 / n) : 0;
      if (std > 0) out.MVRV_Z.push([r.t, (r.mcap - realized) / std]);
    }
    if (r.issUsd !== null) {
      iss.push(r.issUsd);
      issSum += r.issUsd;
      if (iss.length > 365) issSum -= iss[iss.length - 366];
      if (iss.length >= 365 && issSum > 0) out.PUELL.push([r.t, r.issUsd / (issSum / 365)]);
    }
    if (r.flowIn !== null && r.flowOut !== null) out.EXCHANGE_NETFLOW.push([r.t, r.flowIn - r.flowOut]);
  }
  return out;
}

/** Série da BGeometrics (lista de { d, unixTs, <campo> }) → pontos [ms, valor], em ordem de data. */
export function parseBgeometrics(json: unknown, field: string): Point[] {
  if (!Array.isArray(json)) throw new Error("BGeometrics: resposta inesperada");
  const out: Point[] = [];
  for (const r of json as Record<string, unknown>[]) {
    const ts = num(r.unixTs);
    const t = ts !== null ? ts * 1000 : typeof r.d === "string" ? Date.parse(`${r.d}T00:00:00Z`) : NaN;
    // Campo esperado; se vier com outro nome, o único valor numérico da linha.
    let v = num(r[field]);
    if (v === null) {
      const others = Object.entries(r).filter(([k, x]) => k !== "unixTs" && k !== "d" && num(x) !== null);
      if (others.length === 1) v = num(others[0][1]);
    }
    if (Number.isFinite(t) && v !== null) out.push([t, v]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** Campo e caminho de cada indicador na BGeometrics. */
export const BGEOMETRICS: Partial<Record<OnchainId, { path: string; field: string }>> = {
  SOPR: { path: "sopr", field: "sopr" },
  STH_SOPR: { path: "sth-sopr", field: "sthSopr" },
  STH_REALIZED_PRICE: { path: "sth-realized-price", field: "sthRealizedPrice" },
  RHODL: { path: "rhodl-ratio", field: "rhodlRatio" },
  RESERVE_RISK: { path: "reserve-risk", field: "reserveRisk" },
};

/** Campo e caminho na BGeometrics dos indicadores que também calculamos (para conferir o cálculo). */
export const BGEOMETRICS_CHECK: Partial<Record<OnchainId, { path: string; field: string }>> = {
  REALIZED_PRICE: { path: "realized-price", field: "realizedPrice" },
  NUPL: { path: "nupl", field: "nupl" },
  MVRV_Z: { path: "mvrv-zscore", field: "mvrvZscore" },
  PUELL: { path: "puell-multiple", field: "puellMultiple" },
};

/** Tolerância da diferença mediana: relativa (fração) ou absoluta. */
const TOLERANCE: Partial<Record<OnchainId, { rel?: number; abs?: number }>> = {
  REALIZED_PRICE: { rel: 0.03 },
  PUELL: { rel: 0.1 },
  NUPL: { abs: 0.03 },
  MVRV_Z: { abs: 0.25 },
};

export type Agreement = { ok: boolean; diff: number | null; compared: number };

/**
 * O cálculo próprio está perto da BGeometrics? Compara os últimos 90 dias em comum (mesma data UTC)
 * pela diferença mediana; sem dias em comum, não dá para conferir (ok = false).
 */
export function agreement(id: OnchainId, calc: Point[], bg: Point[]): Agreement {
  const tol = TOLERANCE[id];
  const dayOf = (t: number) => Math.floor(t / 86_400_000);
  const ours = new Map(calc.map(([t, v]) => [dayOf(t), v]));
  const pairs = bg.filter(([t]) => ours.has(dayOf(t))).slice(-90);
  if (!tol || !pairs.length) return { ok: false, diff: null, compared: 0 };
  const diffs = pairs
    .map(([t, b]) => {
      const a = ours.get(dayOf(t)) as number;
      return tol.rel !== undefined ? Math.abs(a - b) / Math.max(Math.abs(b), 1e-12) : Math.abs(a - b);
    })
    .sort((x, y) => x - y);
  const mid = diffs.length >> 1;
  const diff = diffs.length % 2 ? diffs[mid] : (diffs[mid - 1] + diffs[mid]) / 2;
  return { ok: diff <= (tol.rel ?? tol.abs ?? 0), diff, compared: pairs.length };
}
