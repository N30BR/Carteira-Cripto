import { describe, expect, test } from "vitest";
import { testDb } from "../helpers/db";
import { users } from "@/db/schema";
import { createChartTab, listChartTabs, reorderChartTabs, saveChartTab } from "@/lib/charts/store";
import { defaultTab } from "@/lib/charts/workspace";

describe("ordem das abas (arrastar e soltar)", () => {
  const setup = () => {
    const db = testDb();
    const mk = (u: string) => db.insert(users).values({ username: u, passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0].id;
    const ana = mk("ana");
    const bia = mk("bia");
    const first = listChartTabs(db, ana)[0].id;
    const ids = [first];
    for (const n of ["B", "C", "D"]) {
      const r = createChartTab(db, ana, n);
      if (r.ok) ids.push(r.id);
    }
    return { db, ana, bia, ids };
  };

  test("muda só a posição; o conteúdo de cada aba fica com ela; vale ao ler de novo (recarregar)", () => {
    const { db, ana, ids } = setup();
    const state = { ...defaultTab(), panes: [{ ...defaultTab().panes[0], symbol: "SOLUSDT", interval: "4h" as const }] };
    expect(saveChartTab(db, ana, ids[3], state)).toEqual({ ok: true });
    const order = [ids[3], ids[0], ids[1], ids[2]];
    expect(reorderChartTabs(db, ana, order)).toEqual({ ok: true });
    const tabs = listChartTabs(db, ana);
    expect(tabs.map((t) => t.id)).toEqual(order);
    expect(tabs[0].state.panes[0]).toMatchObject({ symbol: "SOLUSDT", interval: "4h" });
    // Aba nova continua entrando no fim.
    const r = createChartTab(db, ana, "E");
    expect(r.ok && listChartTabs(db, ana).at(-1)?.id).toBe(r.ok ? r.id : -1);
  });

  test("recusa lista incompleta, repetida, com aba de outra conta ou com lixo", () => {
    const { db, ana, bia, ids } = setup();
    const other = listChartTabs(db, bia)[0].id;
    expect(reorderChartTabs(db, ana, ids.slice(0, 3)).ok).toBe(false);
    expect(reorderChartTabs(db, ana, [ids[0], ids[0], ids[1], ids[2]]).ok).toBe(false);
    expect(reorderChartTabs(db, ana, [other, ids[1], ids[2], ids[3]]).ok).toBe(false);
    expect(reorderChartTabs(db, ana, "1,2,3").ok).toBe(false);
    expect(reorderChartTabs(db, ana, [ids[0], ids[1], ids[2], 1.5]).ok).toBe(false);
    // Nada mudou.
    expect(listChartTabs(db, ana).map((t) => t.id)).toEqual(ids);
    expect(listChartTabs(db, bia).map((t) => t.id)).toEqual([other]);
  });
});
