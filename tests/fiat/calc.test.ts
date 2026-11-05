import { describe, expect, test } from "vitest";
import { addDays, buildFiatCurve, computeFiat, dayTime, parseFiatPeriod } from "@/lib/fiat/calc";
import type { BalancePoint, FiatAccount } from "@/lib/fiat/accounts";

const today = "2026-11-05";
const now = new Date("2026-11-05T15:00:00Z");
const acc = (id: number, name: string, amount: string, date: string): FiatAccount => ({ id, name, amount, date });

describe("datas", () => {
  test("addDays atravessa meses e anos", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  test("parseFiatPeriod", () => {
    expect(parseFiatPeriod("6M")).toBe("6M");
    expect(parseFiatPeriod("Tudo")).toBe("Tudo");
    expect(parseFiatPeriod("7D")).toBe("30D");
  });
});

describe("computeFiat", () => {
  const balances: Record<number, BalancePoint[]> = {
    1: [{ date: "2025-10-01", amount: "1000.00" }, { date: "2026-10-01", amount: "2000.00" }, { date: "2026-11-01", amount: "3000.00" }],
    2: [{ date: "2026-11-04", amount: "1000.00" }],
  };
  const accounts = [acc(1, "PF", "3000.00", "2026-11-01"), acc(2, "PJ", "1000.00", "2026-11-04")];

  test("total, percentuais e variações 1M/1A por conta", () => {
    const r = computeFiat(accounts, balances, today);
    expect(r.total).toBe(4000);
    const pf = r.rows.find((x) => x.name === "PF")!;
    expect(pf.share).toBeCloseTo(0.75, 10);
    expect(pf.past30).toBe(2000);
    expect(pf.change1m).toBeCloseTo(50, 10);
    expect(pf.past365).toBe(1000);
    expect(pf.change1y).toBeCloseTo(200, 10);
    expect(pf.past60).toBe(1000);
    expect(pf.change2m).toBeCloseTo(200, 10);
    expect(pf.change3m).toBeCloseTo(200, 10);
    const pj = r.rows.find((x) => x.name === "PJ")!;
    expect(pj.change1m).toBeNull();
    expect(r.rows.map((x) => x.name)).toEqual(["PF", "PJ"]);
  });

  test("total de 30 dias atrás conta 0 para quem não existia; null se ninguém existia", () => {
    expect(computeFiat(accounts, balances, today).total30).toBe(2000);
    expect(computeFiat([acc(2, "PJ", "1000.00", "2026-11-04")], { 2: balances[2] }, today).total30).toBeNull();
  });

  test("saldo anterior zero ou negativo: variação indisponível", () => {
    const b = { 1: [{ date: "2026-09-01", amount: "0.00" }, { date: "2026-11-01", amount: "10.00" }] };
    expect(computeFiat([acc(1, "X", "10.00", "2026-11-01")], b, today).rows[0].change1m).toBeNull();
  });

  test("participação com total zero ou negativo fica indisponível", () => {
    const r = computeFiat([acc(1, "X", "-5.00", "2026-11-01")], { 1: [{ date: "2026-11-01", amount: "-5.00" }] }, today);
    expect(r.rows[0].share).toBeNull();
  });
});

describe("buildFiatCurve", () => {
  const balances: Record<number, BalancePoint[]> = {
    1: [{ date: "2026-10-20", amount: "100.00" }, { date: "2026-11-01", amount: "300.00" }],
    2: [{ date: "2026-10-25", amount: "50.00" }],
  };

  test("degraus diários: conta vale 0 antes do primeiro saldo; último ponto é agora", () => {
    const pts = buildFiatCurve(balances, "30D", today, now);
    const at = (d: string) => pts.find((p) => p.t === dayTime(d))!.value;
    expect(pts[0].t).toBe(dayTime("2026-10-06"));
    expect(at("2026-10-19")).toBe(0);
    expect(at("2026-10-20")).toBe(100);
    expect(at("2026-10-25")).toBe(150);
    expect(at("2026-11-01")).toBe(350);
    expect(pts.at(-1)).toEqual({ t: now.getTime(), value: 350 });
  });

  test("Tudo começa no primeiro registro; sem saldos não há curva", () => {
    expect(buildFiatCurve(balances, "Tudo", today, now)[0].t).toBe(dayTime("2026-10-20"));
    expect(buildFiatCurve({}, "30D", today, now)).toEqual([]);
  });
});

describe("curva longa", () => {
  test("períodos muito longos são desenhados com no máximo ~1000 pontos", () => {
    const pts = buildFiatCurve({ 1: [{ date: "2005-01-01", amount: "10.00" }] }, "Tudo", today, now);
    expect(pts.length).toBeLessThanOrEqual(1001);
    expect(pts.at(-1)!.value).toBe(10);
  });
});
