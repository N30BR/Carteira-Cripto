import { describe, expect, test } from "vitest";
import { testDb } from "../helpers/db";
import { BG_LIMITS, bgSlot, budgetAllows, spendBudget, windowOf } from "@/lib/charts/onchain-budget";

const at = (h: number, day = 1) => new Date(Date.UTC(2026, 10, day, h, 0, 0));

describe("cota da BGeometrics (gratuita: 10/hora e 15/dia)", () => {
  test("margem de segurança abaixo do limite deles", () => {
    expect(BG_LIMITS.perHour).toBeLessThan(10);
    expect(BG_LIMITS.perDay).toBeLessThan(15);
  });

  test("dia dividido em 5 janelas; cada série tem a sua", () => {
    expect(windowOf(at(0))).toBe(0);
    expect(windowOf(at(5))).toBe(1);
    expect(windowOf(at(23))).toBe(4);
    expect(new Set(["SOPR", "STH_SOPR", "STH_REALIZED_PRICE", "RHODL", "RESERVE_RISK"].map((id) => bgSlot(id as never))).size).toBe(5);
    // 9 séries da BGeometrics (5 só dela + 4 para conferir o cálculo) em 5 janelas: no máximo 2 por janela
    const slots = ["SOPR", "STH_SOPR", "STH_REALIZED_PRICE", "RHODL", "RESERVE_RISK", "REALIZED_PRICE", "NUPL", "MVRV_Z", "PUELL"].map((id) => bgSlot(id as never));
    expect(Math.max(...[0, 1, 2, 3, 4].map((w) => slots.filter((x) => x === w).length))).toBeLessThanOrEqual(2);
  });

  test("com dados guardados: só atualiza na janela da série; sem dados: pode buscar fora dela (se houver cota)", () => {
    const db = testDb();
    const slot = bgSlot("SOPR");
    const inside = at(Math.floor(slot * 4.8) + 1);
    const outside = at((Math.floor(slot * 4.8) + 12) % 24);
    expect(budgetAllows(db, slot, true, inside)).toBe(true);
    expect(budgetAllows(db, slot, true, outside)).toBe(false);
    expect(budgetAllows(db, slot, false, outside)).toBe(true);
  });

  test("conta os pedidos no banco: para no limite por hora e por dia e zera no dia seguinte", () => {
    const db = testDb();
    for (let i = 0; i < BG_LIMITS.perHour; i++) spendBudget(db, at(10));
    expect(budgetAllows(db, 0, false, at(10))).toBe(false);
    expect(budgetAllows(db, 0, false, at(11))).toBe(true);
    for (let i = 0; i < BG_LIMITS.perDay; i++) spendBudget(db, at(12 + (i % 2)));
    expect(budgetAllows(db, 0, false, at(20))).toBe(false);
    expect(budgetAllows(db, 0, false, at(1, 2))).toBe(true);
  });
});

describe("cota da Coin Metrics (cálculo próprio): mesma cota diária, sem janelas", () => {
  test("contadores separados por fonte", () => {
    const db = testDb();
    for (let i = 0; i < BG_LIMITS.perHour; i++) spendBudget(db, at(10), "coinmetrics");
    expect(budgetAllows(db, null, true, at(10), "coinmetrics")).toBe(false);
    expect(budgetAllows(db, 0, false, at(10), "bgeometrics")).toBe(true);
    expect(budgetAllows(db, null, true, at(11), "coinmetrics")).toBe(true);
  });
});
