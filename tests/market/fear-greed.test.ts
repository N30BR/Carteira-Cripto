import { describe, expect, test } from "vitest";
import { FG_RANGES, fgColor, fgReferences, fgWindow, fgYearRange, labelPt, mergeFgHistory, parseFgHistory, parseFgLatest, type FgPoint } from "@/lib/market/fear-greed";

const DAY = 86_400_000;
const d = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

describe("Fear and Greed: leitura da API", () => {
  test("latest", () => {
    expect(parseFgLatest({ data: { value: 20, update_time: "2026-11-13T12:53:10.017Z", value_classification: "Fear" } })).toEqual({
      value: 20,
      label: "Fear",
      updatedAt: Date.parse("2026-11-13T12:53:10.017Z"),
    });
    expect(() => parseFgLatest({ data: { value: 120, update_time: "x", value_classification: "Fear" } })).toThrow();
    expect(() => parseFgLatest({ status: { error_code: "1006" } })).toThrow();
  });
  test("histórico: timestamp em segundos (texto) vira o dia UTC; registros inválidos são ignorados", () => {
    const h = parseFgHistory({
      data: [
        { timestamp: "1794441600", value: 22, value_classification: "Fear" },
        { timestamp: "abc", value: 10, value_classification: "Fear" },
        { timestamp: "1794355200", value: -1, value_classification: "Fear" },
      ],
    });
    expect(h).toEqual([{ t: 1794441600000, value: 22, label: "Fear" }]);
    expect(new Date(h[0].t).toISOString()).toBe("2026-11-12T00:00:00.000Z");
    expect(() => parseFgHistory({ data: null })).toThrow();
  });
  test("páginas juntas em ordem cronológica, sem dias repetidos", () => {
    const a = [{ t: d("2026-11-12"), value: 22, label: "Fear" }, { t: d("2026-11-11"), value: 26, label: "Fear" }];
    const b = [{ t: d("2026-11-11"), value: 26, label: "Fear" }, { t: d("2026-11-10"), value: 30, label: "Fear" }];
    expect(mergeFgHistory([a, b]).map((p) => p.value)).toEqual([30, 26, 22]);
  });
  test("classificação oficial só traduzida", () => {
    expect(["Extreme fear", "Fear", "Neutral", "Greed", "Extreme greed", "Outro"].map(labelPt)).toEqual(["Medo extremo", "Medo", "Neutro", "Ganância", "Ganância extrema", "Outro"]);
  });
  test("cores: vermelho em 0, amarelo em 50, verde em 100", () => {
    expect(fgColor(0)).toBe("rgb(229, 72, 77)");
    expect(fgColor(50)).toBe("rgb(229, 197, 58)");
    expect(fgColor(100)).toBe("rgb(47, 179, 111)");
    expect(fgColor(150)).toBe(fgColor(100));
  });
});

describe("Fear and Greed: referências e extremos", () => {
  const hist: FgPoint[] = Array.from({ length: 400 }, (_, i) => ({ t: d("2025-10-09") + i * DAY, value: (i * 7) % 101, label: "x" }));
  const now = d("2026-11-13") + 13 * 3600_000;
  test("ontem, semana e mês: a observação do dia exato", () => {
    const r = fgReferences(hist, now);
    expect(r.map((x) => new Date(x.point!.t).toISOString().slice(0, 10))).toEqual(["2026-11-12", "2026-11-06", "2026-10-14"]);
    expect(r.every((x) => x.exact)).toBe(true);
  });
  test("sem o dia exato: a anterior mais próxima, marcada", () => {
    const gap = hist.filter((p) => p.t !== d("2026-11-06"));
    const w = fgReferences(gap, now)[1];
    expect(w.exact).toBe(false);
    expect(new Date(w.point!.t).toISOString().slice(0, 10)).toBe("2026-11-05");
    expect(fgReferences([], now)[0].point).toBeNull();
  });
  test("máximo e mínimo dos últimos 365 dias até a última observação", () => {
    const h: FgPoint[] = [
      { t: d("2025-01-01"), value: 99, label: "Extreme greed" }, // fora da janela
      { t: d("2026-03-01"), value: 80, label: "Extreme greed" },
      { t: d("2026-06-01"), value: 10, label: "Extreme fear" },
      { t: d("2026-11-12"), value: 22, label: "Fear" },
    ];
    const r = fgYearRange(h)!;
    expect([r.max.value, r.min.value]).toEqual([80, 10]);
    expect(fgYearRange([])).toBeNull();
  });
  test("janelas 1S, 1M, 3M, 6M, 1A e Tudo", () => {
    const last = hist.at(-1)!.t;
    expect(FG_RANGES).toEqual(["1S", "1M", "3M", "6M", "1A", "Tudo"]);
    expect(fgWindow(hist, "1S", last)).toHaveLength(7);
    expect(fgWindow(hist, "1M", last)).toHaveLength(30);
    expect(fgWindow(hist, "3M", last)).toHaveLength(90);
    expect(fgWindow(hist, "6M", last)).toHaveLength(182);
    expect(fgWindow(hist, "1A", last)).toHaveLength(365);
    expect(fgWindow(hist, "Tudo", last)).toHaveLength(400);
  });
});
