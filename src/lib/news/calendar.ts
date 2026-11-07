// Calendário econômico da aba Notícias: leitura da fonte, períodos, filtros e agrupamento (funções puras).
//
// Fonte gratuita usada: Forex Factory (feed público da semana, sem chave). Classificação de impacto da própria
// fonte, convertida assim: "High" → ★★★, "Medium" → ★★, "Low" → ★; "Holiday" e "Non-Economic" ficam de fora.
// Cobre USD, JPY e EUR (não cobre BRL). Não traz o valor divulgado ("Atual").

export type RegionId = "US" | "JP" | "BR" | "EU";
export const REGIONS: { id: RegionId; label: string; short: string; currency: string; color: string }[] = [
  { id: "US", label: "Estados Unidos", short: "EUA", currency: "USD", color: "#60a5fa" },
  { id: "JP", label: "Japão", short: "JP", currency: "JPY", color: "#f87171" },
  { id: "BR", label: "Brasil", short: "BR", currency: "BRL", color: "#4ade80" },
  { id: "EU", label: "Zona do Euro", short: "UE", currency: "EUR", color: "#facc15" },
];
const REGION_IDS = REGIONS.map((r) => r.id);
const BY_CURRENCY: Record<string, RegionId> = { USD: "US", JPY: "JP", BRL: "BR", EUR: "EU" };

export const NEWS_PERIODS = ["1d", "3d", "7d", "1m"] as const;
export type NewsPeriod = (typeof NEWS_PERIODS)[number];
export const PERIOD_LABEL: Record<NewsPeriod, string> = { "1d": "1 dia", "3d": "3 dias", "7d": "7 dias", "1m": "1 mês" };
/** Próximos eventos (a partir de hoje) ou já ocorridos (até hoje). */
export const NEWS_DIRECTIONS = ["next", "past"] as const;
export type NewsDirection = (typeof NEWS_DIRECTIONS)[number];

export type Stars = 1 | 2 | 3;
export type NewsEvent = {
  id: string;
  title: string;
  region: RegionId;
  currency: string;
  stars: Stars;
  /** Horário do evento (ms, UTC). */
  ts: number;
  forecast: string | null;
  previous: string | null;
  /** Valor divulgado (a fonte gratuita não informa: fica "—"). */
  actual: string | null;
  source: "forexfactory";
};

const IMPACT: Record<string, Stars> = { High: 3, Medium: 2, Low: 1 };
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 40) : null);

/** Feed semanal da Forex Factory → eventos de ★, ★★ e ★★★ das regiões cobertas, em ordem de horário. */
export function parseForexFactory(json: unknown, now = Date.now()): NewsEvent[] {
  if (!Array.isArray(json)) throw new Error("Forex Factory: resposta inesperada");
  const out: NewsEvent[] = [];
  // Resposta externa: ignora itens que não sejam objetos, eventos a mais de 1 ano e corta em 2000.
  const maxTs = now + 365 * 86_400_000;
  for (const r of json as Record<string, unknown>[]) {
    if (out.length >= 2000) break;
    if (!r || typeof r !== "object") continue;
    const region = BY_CURRENCY[String(r.country)];
    const stars = IMPACT[String(r.impact)];
    const ts = typeof r.date === "string" ? Date.parse(r.date) : NaN;
    const title = text(r.title);
    if (!region || !stars || !Number.isFinite(ts) || ts > maxTs || !title) continue;
    out.push({
      id: `ff:${r.country}:${ts}:${title}`.slice(0, 120),
      title: title.length >= 40 ? String(r.title).trim().slice(0, 120) : title,
      region,
      currency: String(r.country),
      stars,
      ts,
      forecast: text(r.forecast),
      previous: text(r.previous),
      actual: text(r.actual),
      source: "forexfactory",
    });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

// ---------- datas no fuso do app ----------
export const localDate = (ts: number, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
export const localTime = (ts: number, tz: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ts));

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Mesmo dia `n` meses depois; se o dia não existir, o último dia do mês. */
const addMonths = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
};

/**
 * Intervalo de datas (inclusive) do período no fuso do app: para a frente a partir de hoje, ou para trás até hoje
 * (1 dia = hoje; 3 dias = hoje e os 2 anteriores; 1 mês = desde o mesmo dia do mês anterior).
 */
export function periodRange(period: NewsPeriod, tz: string, now = new Date(), direction: NewsDirection = "next"): { from: string; to: string } {
  const today = localDate(now.getTime(), tz);
  const days = period === "1d" ? 0 : period === "3d" ? 2 : period === "7d" ? 6 : null;
  if (direction === "past") return { from: days === null ? addMonths(today, -1) : addDays(today, -days), to: today };
  return { from: today, to: days === null ? addMonths(today, 1) : addDays(today, days) };
}

export function filterEvents(events: NewsEvent[], regions: RegionId[], stars: Stars[]): NewsEvent[] {
  return events.filter((e) => regions.includes(e.region) && stars.includes(e.stars));
}

const WEEKDAYS = ["DOMINGO", "SEGUNDA-FEIRA", "TERÇA-FEIRA", "QUARTA-FEIRA", "QUINTA-FEIRA", "SEXTA-FEIRA", "SÁBADO"];
const MONTHS = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];

export type DayGroup = { date: string; weekday: string; label: string; events: NewsEvent[] };
export type MonthGroup = { key: string; label: string; days: DayGroup[] };

/**
 * Organiza por mês → dia → importância (★★★ antes) → horário. Só eventos dentro do intervalo (e só os meses com eventos).
 */
export function groupEvents(events: NewsEvent[], period: NewsPeriod, tz: string, range: { from: string; to: string }): { months: MonthGroup[] } {
  const byDay = new Map<string, NewsEvent[]>();
  for (const e of events) {
    const date = localDate(e.ts, tz);
    if (date < range.from || date > range.to) continue;
    (byDay.get(date) ?? byDay.set(date, []).get(date)!).push(e);
  }
  const months = new Map<string, MonthGroup>();
  const monthOf = (key: string) => {
    if (!months.has(key)) {
      const [y, m] = key.split("-").map(Number);
      months.set(key, { key, label: `${MONTHS[m - 1]} ${y}`, days: [] });
    }
    return months.get(key)!;
  };
  for (const date of [...byDay.keys()].sort()) {
    const list = byDay.get(date)!.sort((a, b) => b.stars - a.stars || a.ts - b.ts);
    const wd = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
    const [, m, d] = date.split("-");
    monthOf(date.slice(0, 7)).days.push({ date, weekday: wd, label: `${d}/${m}`, events: list });
  }
  return { months: [...months.values()].sort((a, b) => a.key.localeCompare(b.key)) };
}

/**
 * Junta uma busca nova aos eventos guardados: dentro da janela da busca, vale a busca nova (revisões de horário,
 * previsão etc.); fora dela, preserva os guardados. Descarta o que tiver mais de 120 dias.
 */
export function mergeEvents(stored: NewsEvent[], fresh: NewsEvent[], window: { from: number; to: number }, now: number): NewsEvent[] {
  const keep = stored.filter((e) => (e.ts < window.from || e.ts > window.to) && e.ts >= now - 120 * 86_400_000);
  return [...keep, ...fresh].sort((a, b) => a.ts - b.ts);
}

export type NewsPrefs = { period: NewsPeriod; regions: RegionId[]; stars: Stars[]; direction: NewsDirection };
export const NEWS_COOKIE = "noticias-filtros";
export const DEFAULT_NEWS_PREFS: NewsPrefs = { period: "7d", regions: [...REGION_IDS], stars: [1, 2, 3], direction: "next" };

/** Filtros salvos no cookie (só valores conhecidos; inválido → padrão). */
export function parseNewsPrefs(raw: string | undefined): NewsPrefs {
  if (!raw) return { ...DEFAULT_NEWS_PREFS, regions: [...DEFAULT_NEWS_PREFS.regions], stars: [...DEFAULT_NEWS_PREFS.stars] };
  try {
    const v = JSON.parse(raw.startsWith("%") ? decodeURIComponent(raw) : raw) as Partial<Record<keyof NewsPrefs | "v", unknown>>;
    const period = (NEWS_PERIODS as readonly unknown[]).includes(v.period) ? (v.period as NewsPeriod) : DEFAULT_NEWS_PREFS.period;
    const regions = Array.isArray(v.regions) ? REGION_IDS.filter((r) => (v.regions as unknown[]).includes(r)) : [];
    let stars = Array.isArray(v.stars) ? ([3, 2, 1] as Stars[]).filter((s) => (v.stars as unknown[]).includes(s)) : [];
    // Filtro salvo antes de existir ★ com as duas opções de então marcadas (= "todas"): passa a incluir ★.
    if (stars.length === 2 && stars.includes(3) && stars.includes(2) && !(v.stars as unknown[]).includes(1) && v.v !== 2) stars = [3, 2, 1];
    const direction = (NEWS_DIRECTIONS as readonly unknown[]).includes(v.direction) ? (v.direction as NewsDirection) : DEFAULT_NEWS_PREFS.direction;
    return { period, regions: regions.length ? regions : [...REGION_IDS], stars: stars.length ? stars : [...DEFAULT_NEWS_PREFS.stars], direction };
  } catch {
    return parseNewsPrefs(undefined);
  }
}
