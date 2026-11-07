// Panorama Macro: leitura das fontes e cálculos (funções puras, testadas sem rede).
// Pontos são [ms (UTC), valor], em ordem de data.

export type Point = [number, number];
const DAY = 86_400_000;

/** "2026-11-06" → ms (meia-noite UTC). */
export const dayMs = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

// ---------- Frankfurter (taxas de referência do BCE) ----------

/** Série de câmbio por moeda: unidades da moeda por 1 USD, por dia útil. Ignora valores inválidos. */
export function parseFrankfurterSeries(json: unknown): Record<string, Point[]> {
  const rates = (json as { rates?: Record<string, Record<string, unknown>> } | null)?.rates;
  if (!rates || typeof rates !== "object") throw new Error("Câmbio: resposta inesperada");
  const out: Record<string, Point[]> = {};
  for (const [date, row] of Object.entries(rates)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !row || typeof row !== "object") continue;
    for (const [ccy, v] of Object.entries(row)) {
      if (!/^[A-Z]{3}$/.test(ccy) || typeof v !== "number" || !(v > 0) || !Number.isFinite(v)) continue;
      (out[ccy] ??= []).push([dayMs(date), v]);
    }
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a[0] - b[0]);
  return out;
}

/**
 * DXY pela fórmula oficial da ICE (cesta fixa de 6 moedas), com taxas de 1 USD em cada moeda:
 * 50,14348112 × EURUSD^−0,576 × USDJPY^0,136 × GBPUSD^−0,119 × USDCAD^0,091 × USDSEK^0,042 × USDCHF^0,036.
 * É um cálculo com as taxas de referência do BCE (uma por dia), não a cotação do contrato da ICE.
 */
export function dxyFromUsdRates(r: { EUR: number; JPY: number; GBP: number; CAD: number; SEK: number; CHF: number }): number {
  const eurusd = 1 / r.EUR;
  const gbpusd = 1 / r.GBP;
  return 50.14348112 * eurusd ** -0.576 * r.JPY ** 0.136 * gbpusd ** -0.119 * r.CAD ** 0.091 * r.SEK ** 0.042 * r.CHF ** 0.036;
}

/** Série do DXY a partir das séries de câmbio (só os dias com as 6 moedas). */
export function dxySeries(fx: Record<string, Point[]>): Point[] {
  const need = ["EUR", "JPY", "GBP", "CAD", "SEK", "CHF"] as const;
  const maps = need.map((c) => new Map((fx[c] ?? []).map(([t, v]) => [t, v])));
  return (fx.EUR ?? [])
    .filter(([t]) => maps.every((m) => m.has(t)))
    .map(([t]) => {
      const [EUR, JPY, GBP, CAD, SEK, CHF] = maps.map((m) => m.get(t) as number);
      return [t, dxyFromUsdRates({ EUR, JPY, GBP, CAD, SEK, CHF })] as Point;
    });
}

// ---------- Banco do Japão (API oficial) ----------

/** Série da API do BoJ: datas AAAAMM (mensal) ou AAAAMMDD (diária); valores nulos são ignorados. */
export function parseBojSeries(json: unknown): Point[] {
  const set = (json as { RESULTSET?: { VALUES?: { SURVEY_DATES?: unknown[]; VALUES?: unknown[] } }[] } | null)?.RESULTSET?.[0]?.VALUES;
  if (!set || !Array.isArray(set.SURVEY_DATES) || !Array.isArray(set.VALUES)) throw new Error("BoJ: resposta inesperada");
  const out: Point[] = [];
  set.SURVEY_DATES.forEach((d, i) => {
    const s = String(d);
    const v = set.VALUES?.[i];
    if (typeof v !== "number" || !Number.isFinite(v)) return;
    if (/^\d{8}$/.test(s)) out.push([dayMs(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`), v]);
    else if (/^\d{6}$/.test(s)) out.push([dayMs(`${s.slice(0, 4)}-${s.slice(4, 6)}-01`), v]);
  });
  return out.sort((a, b) => a[0] - b[0]);
}

// ---------- BCE (API de dados, CSV) ----------

/** CSV do portal de dados do BCE: colunas TIME_PERIOD (AAAA-MM) e OBS_VALUE. */
export function parseEcbCsv(csv: string): Point[] {
  const lines = csv.trim().split(/\r?\n/);
  const head = lines[0]?.split(",") ?? [];
  const ti = head.indexOf("TIME_PERIOD");
  const vi = head.indexOf("OBS_VALUE");
  if (ti < 0 || vi < 0) throw new Error("BCE: resposta inesperada");
  const out: Point[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const t = cols[ti];
    const v = Number(cols[vi]);
    if (!/^\d{4}-\d{2}$/.test(t ?? "") || cols[vi] === "" || !Number.isFinite(v)) continue;
    out.push([dayMs(`${t}-01`), v]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

// ---------- variações ----------

/** Último ponto com data ≤ t (busca binária). */
export function valueAt(points: Point[], t: number): Point | null {
  let lo = 0;
  let hi = points.length - 1;
  let best: Point | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= t) {
      best = points[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best;
}

/** Variação % entre o último ponto e o de `days` dias antes; null se o histórico não chega lá. */
export function pctChangeOver(points: Point[], days: number): number | null {
  const last = points.at(-1);
  if (!last) return null;
  const target = last[0] - days * DAY;
  if (points[0][0] > target + DAY) return null; // histórico curto demais
  const base = valueAt(points, target);
  if (!base || base[1] === 0) return null;
  return ((last[1] - base[1]) / base[1]) * 100;
}

/** Variação em relação à observação anterior: % ou diferença (p.p./pontos). */
export function lastChange(points: Point[], kind: "pct" | "diff"): number | null {
  if (points.length < 2) return null;
  const [, a] = points[points.length - 2];
  const [, b] = points[points.length - 1];
  if (kind === "diff") return b - a;
  return a === 0 ? null : ((b - a) / a) * 100;
}

/**
 * Variação num período (dias): 1 dia = contra a observação anterior (séries diárias de dias úteis);
 * mais = contra o valor de `days` dias antes. % ou diferença (p.p./pontos). Histórico curto → null.
 */
export function changeOverPeriod(points: Point[], days: number, kind: "pct" | "diff"): number | null {
  if (days <= 1) return lastChange(points, kind);
  const last = points.at(-1);
  if (!last) return null;
  const target = last[0] - days * DAY;
  if (points[0][0] > target + DAY) return null;
  const base = valueAt(points, target);
  if (!base) return null;
  if (kind === "diff") return last[1] - base[1];
  return base[1] === 0 ? null : ((last[1] - base[1]) / base[1]) * 100;
}

/**
 * Última decisão numa série de taxa oficial (degraus): data em que o valor mudou e a mudança (p.p.).
 * `minStep` ignora oscilações menores (ex.: taxa de mercado em volta da meta).
 */
export function lastDecision(points: Point[], minStep = 1e-9): { at: number; change: number } | null {
  if (points.length < 2) return null;
  const current = points[points.length - 1][1];
  for (let i = points.length - 1; i > 0; i--) {
    if (Math.abs(points[i][1] - points[i - 1][1]) >= minStep) {
      // Antes do salto, o nível anterior; depois, o atual.
      return { at: points[i][0], change: current - points[i - 1][1] };
    }
  }
  return null;
}

/** Pontos a partir de `days` dias antes do último (para os minigráficos). */
export function tail(points: Point[], days: number): Point[] {
  const last = points.at(-1);
  if (!last) return [];
  const from = last[0] - days * DAY;
  return points.filter(([t]) => t >= from);
}

/** Até `max` pontos, igualmente espaçados (o último sempre entra): minigráficos leves. */
export function thin(points: Point[], max = 120): Point[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

// ---------- M2 em US$ ----------

const monthKey = (t: number) => new Date(t).toISOString().slice(0, 7);

/** Média mensal de uma série diária (chave AAAA-MM). */
export function monthlyAverage(points: Point[]): Map<string, number> {
  const acc = new Map<string, { s: number; n: number }>();
  for (const [t, v] of points) {
    const k = monthKey(t);
    const a = acc.get(k) ?? { s: 0, n: 0 };
    a.s += v;
    a.n += 1;
    acc.set(k, a);
  }
  return new Map([...acc].map(([k, a]) => [k, a.s / a.n]));
}

/**
 * Converte uma série mensal em moeda local para trilhões de US$ pela taxa média do mês (unidades da moeda
 * por 1 USD). `scale` leva o valor da fonte para unidades da moeda. Meses sem taxa ficam de fora.
 */
export function toUsdTrillions(points: Point[], scale: number, usdRate: Map<string, number> | null): Point[] {
  return points.flatMap(([t, v]) => {
    const rate = usdRate ? usdRate.get(monthKey(t)) : 1;
    return rate ? [[t, (v * scale) / rate / 1e12] as Point] : [];
  });
}

/** Variação anual (%) do último mês em relação ao mesmo mês do ano anterior. */
export function yoy(points: Point[]): number | null {
  const last = points.at(-1);
  if (!last) return null;
  const d = new Date(last[0]);
  const target = Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), 1);
  const base = points.find(([t]) => t === target);
  return base && base[1] ? ((last[1] - base[1]) / base[1]) * 100 : null;
}

/** Soma por mês, só nos meses em que TODAS as séries têm valor (não mistura agregados incompletos). */
export function sumByMonth(series: Point[][]): Point[] {
  if (!series.length) return [];
  const maps = series.map((s) => new Map(s.map(([t, v]) => [t, v])));
  return series[0].filter(([t]) => maps.every((m) => m.has(t))).map(([t]) => [t, maps.reduce((s, m) => s + (m.get(t) as number), 0)] as Point);
}
