import { fetchJsonCapped } from "@/lib/http";

// API pública de dados de mercado da Bybit (sem chave): open interest histórico do perpétuo em USDT (linear).
// Usada pelo mapa de liquidações dos Gráficos, porque a Binance só guarda ~30 dias de open interest e a Bybit tem o
// histórico desde 2020. Respostas tratadas como não confiáveis (tamanho limitado, campos conferidos).

const PAGE = 200;
const MAX_BYTES = 200_000;
const TIMEOUT_MS = 10_000;

/** Períodos da Bybit para o tempo do gráfico (6h e 12h não existem lá: usa 4h, que é mais fino). */
export const BYBIT_OI_PERIOD: Record<string, string> = {
  "1m": "5min",
  "5m": "5min",
  "15m": "15min",
  "30m": "30min",
  "1h": "1h",
  "4h": "4h",
  "6h": "4h",
  "12h": "4h",
  "1d": "1d",
  "2d": "1d",
  "3d": "1d",
  "1w": "1d",
  "1M": "1d",
  "6M": "1d",
  "1y": "1d",
};

const base = () => process.env.BYBIT_BASE_URL || "https://api.bybit.com";

/**
 * Open interest (em moedas) de `fromMs` até agora, do mais antigo para o mais novo, em páginas de 200 (no máximo
 * `maxPages`). A Bybit devolve do mais novo para o mais antigo, com um cursor para a página seguinte.
 */
export async function fetchBybitOpenInterest(symbol: string, period: string, fromMs: number, nowMs = Date.now(), maxPages = 30): Promise<[number, number][]> {
  if (!/^[A-Z0-9]{2,20}$/.test(symbol)) throw new Error("Par inválido");
  const out = new Map<number, number>();
  let cursor = "";
  let previousOldest = Infinity;
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({ category: "linear", symbol, intervalTime: period, limit: String(PAGE), startTime: String(Math.floor(fromMs)), endTime: String(Math.floor(nowMs)) });
    // O cursor já vem codificado (ex.: "lastid%3D883%26lasttime%3D…"): decodifica para não codificar duas vezes.
    if (cursor) params.set("cursor", cursor);
    const body = (await fetchJsonCapped(`${base()}/v5/market/open-interest?${params}`, MAX_BYTES, "Bybit", TIMEOUT_MS)) as {
      retCode?: unknown;
      result?: { list?: unknown; nextPageCursor?: unknown };
    };
    if (body?.retCode !== 0) throw new Error("Bybit: sem open interest para este par");
    const list = Array.isArray(body.result?.list) ? body.result.list : [];
    for (const r of list as { timestamp?: unknown; openInterest?: unknown }[]) {
      const t = Number(r?.timestamp);
      const v = Number(r?.openInterest);
      if (Number.isFinite(t) && Number.isFinite(v) && v >= 0) out.set(t, v);
    }
    const next = typeof body.result?.nextPageCursor === "string" ? body.result.nextPageCursor : "";
    const oldest = list.length ? Math.min(...(list as { timestamp?: unknown }[]).map((r) => Number(r?.timestamp))) : NaN;
    // Para quando acabou, chegou à data pedida ou a página não andou para trás (proteção contra repetição).
    if (!next || !list.length || !(oldest > fromMs) || !(oldest < previousOldest) || next.length > 200) break;
    previousOldest = oldest;
    try {
      cursor = decodeURIComponent(next);
    } catch {
      break;
    }
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]);
}
