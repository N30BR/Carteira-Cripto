// Fluxos dos ETFs de Bitcoin à vista (funções puras).
// Fluxo líquido (dinheiro que entrou − saiu) ≠ patrimônio sob gestão (AUM, que também varia com o preço do BTC)
// ≠ valorização do BTC. Dias sem pregão não existem na série (não viram zero).
import type { EtfDaily, EtfFundRow } from "./parse";

const DAY = 86_400_000;
const t = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** Soma do fluxo nas sessões dos últimos `days` dias corridos até a última sessão; null sem sessões. */
export function flowSum(rows: { date: string; netInflow: number | null }[], days: number): number | null {
  const valid = rows.filter((r) => r.netInflow !== null);
  if (!valid.length) return null;
  const last = t(valid[valid.length - 1].date);
  const from = last - (days - 1) * DAY;
  const inWin = valid.filter((r) => t(r.date) >= from);
  return inWin.length ? inWin.reduce((s, r) => s + (r.netInflow as number), 0) : null;
}

export type FundSummary = {
  ticker: string;
  name: string;
  issuer: string;
  lastDate: string | null;
  day: number | null;
  d7: number | null;
  d30: number | null;
  d90: number | null;
  aum: number | null;
  trend: "Entradas" | "Saídas" | "Misto" | "Sem dados";
  /** Fluxo diário recente (para o minigráfico). */
  spark: [number, number][];
};

/** Emissor de cada ETF spot de BTC nos EUA (nome público do fundo). */
export const ISSUERS: Record<string, string> = {
  IBIT: "BlackRock (iShares)",
  FBTC: "Fidelity",
  GBTC: "Grayscale",
  BTC: "Grayscale (Mini)",
  ARKB: "ARK / 21Shares",
  BITB: "Bitwise",
  HODL: "VanEck",
  BRRR: "Valkyrie / CoinShares",
  EZBC: "Franklin Templeton",
  BTCO: "Invesco Galaxy",
  BTCW: "WisdomTree",
  MSBT: "Morgan Stanley",
  DEFI: "Hashdex",
};

/** Tendência pelas últimas 5 sessões: 4+ positivas = entradas; 4+ negativas = saídas; senão, misto. */
export function trendOf(rows: { netInflow: number | null }[]): FundSummary["trend"] {
  const last = rows.filter((r) => r.netInflow !== null).slice(-5);
  if (!last.length) return "Sem dados";
  const pos = last.filter((r) => (r.netInflow as number) > 0).length;
  const neg = last.filter((r) => (r.netInflow as number) < 0).length;
  if (pos >= 4) return "Entradas";
  if (neg >= 4) return "Saídas";
  return "Misto";
}

export function summarizeFund(ticker: string, name: string, rows: EtfFundRow[]): FundSummary {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted.at(-1) ?? null;
  return {
    ticker,
    name,
    issuer: ISSUERS[ticker] ?? "",
    lastDate: last?.date ?? null,
    day: last?.netInflow ?? null,
    d7: flowSum(sorted, 7),
    d30: flowSum(sorted, 30),
    d90: flowSum(sorted, 90),
    aum: [...sorted].reverse().find((r) => r.netAssets !== null)?.netAssets ?? null,
    trend: trendOf(sorted),
    spark: sorted.slice(-30).map((r) => [t(r.date), r.netInflow as number]),
  };
}

export type EtfReading = {
  state: "Fluxo positivo" | "Fluxo negativo" | "Fluxo misto" | "Fluxo neutro" | "Sem dados";
  /** Frases curtas sobre persistência, magnitude, concentração e tendência. */
  notes: string[];
};

/**
 * Leitura resumida (regras simples e documentadas):
 * - persistência: sessões positivas/negativas entre as últimas 10;
 * - magnitude: soma de 7 dias comparada à média de |fluxo diário| dos últimos 90 dias (×7);
 * - concentração: participação do maior ETF no total absoluto de 7 dias;
 * - estado: soma de 7 dias acima de 25% da magnitude típica = positivo/negativo; senão, neutro; sinais trocados
 *   entre 7 e 30 dias = misto.
 */
export function readFlows(total: EtfDaily[], funds: FundSummary[]): EtfReading {
  const valid = total.filter((r) => r.netInflow !== null);
  if (valid.length < 5) return { state: "Sem dados", notes: ["Histórico de fluxos insuficiente."] };
  const d7 = flowSum(valid, 7) ?? 0;
  const d30 = flowSum(valid, 30) ?? 0;
  const recent = valid.slice(-90);
  const typical = (recent.reduce((s, r) => s + Math.abs(r.netInflow as number), 0) / recent.length) * 7;
  const last10 = valid.slice(-10);
  const pos = last10.filter((r) => (r.netInflow as number) > 0).length;
  const neg = last10.filter((r) => (r.netInflow as number) < 0).length;
  let state: EtfReading["state"];
  if (Math.sign(d7) !== Math.sign(d30) && Math.abs(d30) > typical * 0.25) state = "Fluxo misto";
  else if (d7 > typical * 0.25) state = "Fluxo positivo";
  else if (d7 < -typical * 0.25) state = "Fluxo negativo";
  else state = "Fluxo neutro";
  const notes = [`Persistência: ${pos} sessões com entrada e ${neg} com saída nas últimas ${last10.length}.`];
  if (typical > 0) notes.push(`Magnitude: 7 dias somam ${(d7 / typical).toFixed(1)}× o volume semanal típico dos últimos 90 dias (em valor absoluto).`);
  const abs = funds.filter((f) => f.d7 !== null).map((f) => ({ t: f.ticker, v: Math.abs(f.d7 as number) }));
  const sum = abs.reduce((s, x) => s + x.v, 0);
  if (sum > 0) {
    const top = abs.sort((a, b) => b.v - a.v)[0];
    notes.push(`Concentração: ${top.t} responde por ${Math.round((top.v / sum) * 100)}% do fluxo absoluto de 7 dias.`);
  }
  notes.push(`Tendência: ${d30 >= 0 ? "entrada" : "saída"} líquida em 30 dias.`);
  return { state, notes };
}
