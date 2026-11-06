import { describe, expect, test } from "vitest";
import {
  NEWS_PERIODS,
  REGIONS,
  filterEvents,
  groupEvents,
  mergeEvents,
  parseForexFactory,
  parseNewsPrefs,
  periodRange,
  type NewsEvent,
} from "@/lib/news/calendar";

const TZ = "America/Sao_Paulo";

describe("Forex Factory (gratuita): leitura", () => {
  const feed = [
    { title: "Non-Farm Employment Change", country: "USD", date: "2026-11-06T08:30:00-05:00", impact: "High", forecast: "65K", previous: "29K" },
    { title: "Retail Sales m/m", country: "EUR", date: "2026-11-06T05:00:00-05:00", impact: "Medium", forecast: "", previous: "0.2%" },
    { title: "Tankan", country: "JPY", date: "2026-11-05T18:50:00-05:00", impact: "High", forecast: "", previous: "" },
    { title: "Baixo impacto", country: "USD", date: "2026-11-06T10:00:00-05:00", impact: "Low", forecast: "", previous: "" },
    { title: "Feriado", country: "USD", date: "2026-11-06T00:00:00-05:00", impact: "Holiday", forecast: "", previous: "" },
    { title: "Outro país", country: "GBP", date: "2026-11-06T02:00:00-05:00", impact: "High", forecast: "", previous: "" },
  ];

  test("só EUA, Japão e Zona do Euro; Alto = ★★★, Médio = ★★; Baixo e feriados ficam fora", () => {
    const ev = parseForexFactory(feed);
    expect(ev.map((e) => [e.region, e.stars])).toEqual([
      ["JP", 3],
      ["EU", 2],
      ["US", 3],
    ]);
    const nfp = ev.find((e) => e.title.startsWith("Non-Farm"))!;
    expect(nfp).toMatchObject({ currency: "USD", forecast: "65K", previous: "29K", actual: null, ts: Date.parse("2026-11-06T13:30:00Z") });
    expect(ev.find((e) => e.region === "EU")!.forecast).toBeNull(); // vazio = sem previsão ("—")
  });

  test("resposta inesperada vira erro (não inventa eventos)", () => {
    expect(() => parseForexFactory({ error: "x" })).toThrow();
  });
});

describe("períodos (no fuso do app)", () => {
  const now = new Date("2026-11-06T15:00:00Z"); // 12h em São Paulo
  test("1 dia, 3 dias, 7 dias, 1 mês e 3 meses (mesmo dia do mês seguinte, respeitando o calendário)", () => {
    expect(NEWS_PERIODS).toEqual(["1d", "3d", "7d", "1m", "3m"]);
    expect(periodRange("1d", TZ, now)).toEqual({ from: "2026-11-06", to: "2026-11-06" });
    expect(periodRange("3d", TZ, now)).toEqual({ from: "2026-11-06", to: "2026-11-08" });
    expect(periodRange("7d", TZ, now)).toEqual({ from: "2026-11-06", to: "2026-11-12" });
    expect(periodRange("1m", TZ, now)).toEqual({ from: "2026-11-06", to: "2026-12-06" });
    expect(periodRange("3m", TZ, now)).toEqual({ from: "2026-11-06", to: "2027-02-06" });
    // 31/jan + 1 mês = 28/fev (o dia não existe: último dia do mês)
    expect(periodRange("1m", TZ, new Date("2027-01-31T15:00:00Z")).to).toBe("2027-02-28");
  });
});

const ev = (p: Partial<NewsEvent> & { ts: number }): NewsEvent => ({
  id: String(p.ts) + (p.title ?? ""),
  title: p.title ?? "Evento",
  region: p.region ?? "US",
  currency: p.currency ?? "USD",
  stars: p.stars ?? 3,
  forecast: null,
  previous: null,
  actual: null,
  source: "forexfactory",
  ...p,
});

describe("filtros combináveis", () => {
  const list = [ev({ ts: 1, region: "US", stars: 3 }), ev({ ts: 2, region: "JP", stars: 2 }), ev({ ts: 3, region: "EU", stars: 3 })];
  test("regiões e estrelas ao mesmo tempo", () => {
    expect(filterEvents(list, ["US", "JP"], [3]).map((e) => e.ts)).toEqual([1]);
    expect(filterEvents(list, ["US", "JP", "EU", "BR"], [2, 3])).toHaveLength(3);
    expect(filterEvents(list, ["JP"], [2]).map((e) => e.ts)).toEqual([2]);
    expect(filterEvents(list, [], [2, 3])).toEqual([]);
  });
});

describe("agrupamento por período", () => {
  // 06/11 (sexta) e 07/11, no fuso de São Paulo
  const a = ev({ ts: Date.parse("2026-11-06T11:00:00Z"), stars: 2, title: "A2 08h" });
  const b = ev({ ts: Date.parse("2026-11-06T14:00:00Z"), stars: 3, title: "B3 11h" });
  const c = ev({ ts: Date.parse("2026-11-06T12:30:00Z"), stars: 3, title: "C3 09h30" });
  const d = ev({ ts: Date.parse("2026-12-03T12:00:00Z"), stars: 3, title: "D3 dez" });

  test("dentro do dia: ★★★ antes de ★★ e, em cada nível, por horário", () => {
    const g = groupEvents([a, b, c], "1d", TZ, { from: "2026-11-06", to: "2026-11-06" });
    expect(g.months).toHaveLength(1);
    expect(g.months[0].days[0].events.map((e) => e.title)).toEqual(["C3 09h30", "B3 11h", "A2 08h"]);
  });

  test("3 meses: separa por mês (todos os meses do intervalo, mesmo sem eventos), depois dia", () => {
    const g = groupEvents([d, a], "3m", TZ, { from: "2026-11-06", to: "2027-02-06" });
    expect(g.months.map((m) => m.key)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(g.months[0].days.map((x) => x.date)).toEqual(["2026-11-06"]);
    expect(g.months[2].days).toEqual([]);
  });

  test("fora do intervalo não aparece; dias sem eventos são omitidos", () => {
    const g = groupEvents([a, d], "7d", TZ, { from: "2026-11-06", to: "2026-11-12" });
    expect(g.months.flatMap((m) => m.days.map((x) => x.date))).toEqual(["2026-11-06"]);
  });
});

describe("acúmulo semanal e preferências", () => {
  test("a busca nova substitui a mesma semana e preserva as outras; descarta o que tiver mais de 120 dias", () => {
    const now = Date.parse("2026-11-06T00:00:00Z");
    const old = [ev({ ts: now - 200 * 86_400_000, title: "velho" }), ev({ ts: now - 10 * 86_400_000, title: "semana passada" }), ev({ ts: now + 3600_000, title: "revisado" })];
    const fresh = [ev({ ts: now + 3600_000, title: "revisado", forecast: "1%" })];
    const merged = mergeEvents(old, fresh, { from: now - 2 * 86_400_000, to: now + 5 * 86_400_000 }, now);
    expect(merged.map((e) => e.title)).toEqual(["semana passada", "revisado"]);
    expect(merged[1].forecast).toBe("1%");
  });

  test("preferências do cookie: só valores conhecidos; padrão = 7 dias, todas as regiões, ★★ e ★★★", () => {
    expect(REGIONS.map((r) => r.id)).toEqual(["US", "JP", "BR", "EU"]);
    expect(parseNewsPrefs(undefined)).toEqual({ period: "7d", regions: ["US", "JP", "BR", "EU"], stars: [2, 3] });
    expect(parseNewsPrefs(JSON.stringify({ period: "3m", regions: ["US", "JP", "XX"], stars: [3, 1] }))).toEqual({ period: "3m", regions: ["US", "JP"], stars: [3] });
    expect(parseNewsPrefs("{lixo")).toEqual(parseNewsPrefs(undefined));
  });
});
