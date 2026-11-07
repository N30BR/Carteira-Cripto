import { afterEach, describe, expect, test } from "vitest";
import { testDb } from "./helpers/db";
import { RELEASES, computeActual, fillActuals, nyDate } from "@/lib/news/actuals";
import type { NewsEvent } from "@/lib/news/calendar";

const ev = (title: string, iso: string, region: NewsEvent["region"] = "US"): NewsEvent => ({
  id: title + iso,
  title,
  region,
  currency: "USD",
  stars: 3,
  ts: Date.parse(iso),
  forecast: null,
  previous: null,
  actual: null,
  source: "forexfactory",
});

describe("valor divulgado (ALFRED)", () => {
  test("só aceita o número publicado exatamente no dia do evento", () => {
    const spec = RELEASES["Unemployment Rate"];
    const obs = [
      { date: "2026-10-01", value: "4.3", realtime_start: "2026-11-06" },
      { date: "2026-09-01", value: "4.2", realtime_start: "2026-10-03" },
    ];
    expect(computeActual(obs, spec, "2026-11-06")).toBe("4.3%");
    // No dia seguinte (versão sem publicação nova naquele dia): não mostra.
    expect(computeActual(obs, spec, "2026-11-07")).toBeNull();
  });

  test("variação m/m e diferença com valores da mesma publicação; y/y pela mesma data um ano antes", () => {
    const pay = [
      { date: "2026-10-01", value: "160100", realtime_start: "2026-11-06" },
      { date: "2026-09-01", value: "160035", realtime_start: "2026-11-06" },
    ];
    expect(computeActual(pay, RELEASES["Non-Farm Employment Change"], "2026-11-06")).toBe("65K");
    const cpi = [
      { date: "2026-10-01", value: "330.33", realtime_start: "2026-11-12" },
      { date: "2026-09-01", value: "329.34", realtime_start: "2026-10-15" },
    ];
    expect(computeActual(cpi, RELEASES["CPI m/m"], "2026-11-12")).toBe("0.3%");
    const yoy = [
      { date: "2026-10-01", value: "103", realtime_start: "2026-11-12" },
      { date: "2025-10-01", value: "100", realtime_start: "2025-11-13" },
    ];
    expect(computeActual(yoy, RELEASES["CPI y/y"], "2026-11-12")).toBe("3.0%");
    expect(computeActual([{ date: "2026-10-01", value: ".", realtime_start: "2026-11-12" }], RELEASES["CPI m/m"], "2026-11-12")).toBeNull();
  });

  test("data do evento no calendário de Nova York", () => {
    expect(nyDate(Date.parse("2026-11-06T13:30:00Z"))).toBe("2026-11-06");
    expect(nyDate(Date.parse("2026-11-07T02:00:00Z"))).toBe("2026-11-06");
  });

  const realFetch = globalThis.fetch;
  const realKey = process.env.FRED_API_KEY;
  afterEach(() => {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.FRED_API_KEY;
    else process.env.FRED_API_KEY = realKey;
  });

  test("preenche só eventos dos EUA já ocorridos com série conhecida; guarda o resultado; sem chave não consulta", async () => {
    const db = testDb();
    const now = new Date("2026-11-07T12:00:00Z");
    const list = [
      ev("Unemployment Rate", "2026-11-06T13:30:00Z"),
      ev("Unemployment Rate", "2026-11-20T13:30:00Z"), // futuro
      ev("ISM Manufacturing PMI", "2026-11-02T15:00:00Z"), // sem série no FRED
      ev("Retail Sales m/m", "2026-11-06T10:00:00Z", "EU"),
    ];
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify({ observations: [{ date: "2026-10-01", value: "4.3", realtime_start: "2026-11-06" }] }));
    }) as unknown as typeof fetch;
    delete process.env.FRED_API_KEY;
    expect((await fillActuals(db, list, now)).map((e) => e.actual)).toEqual([null, null, null, null]);
    expect(calls).toBe(0);
    process.env.FRED_API_KEY = "a".repeat(32);
    const out = await fillActuals(db, list, now);
    expect(out.map((e) => e.actual)).toEqual(["4.3%", null, null, null]);
    expect(calls).toBe(1);
    // Segunda vez: vem do cache, sem nova consulta; a lista original não é alterada.
    await fillActuals(db, list, now);
    expect(calls).toBe(1);
    expect(list[0].actual).toBeNull();
  });

  test("FRED fora do ar: fica “—” (sem erro na página)", async () => {
    process.env.FRED_API_KEY = "a".repeat(32);
    globalThis.fetch = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
    const out = await fillActuals(testDb(), [ev("Unemployment Rate", "2026-11-06T13:30:00Z")], new Date("2026-11-07T12:00:00Z"));
    expect(out[0].actual).toBeNull();
  });
});
