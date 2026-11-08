import { beforeEach, describe, expect, test, vi } from "vitest";
import { testDb } from "../helpers/db";
import { users } from "@/db/schema";
import { CHART_TOOLS, DEFAULT_INTERVALS, defaultTab, LIMITS } from "@/lib/charts/workspace";
import { getChartPrefs, listChartTabs } from "@/lib/charts/store";
import { resetChartLimits } from "@/lib/charts/limit";

const state = vi.hoisted(() => ({ db: null as unknown, userId: 0 }));
vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: () => state.db }));
vi.mock("@/lib/auth/current", () => ({ requireUser: async () => ({ id: state.userId }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import {
  createChartTabAction,
  deleteChartTabAction,
  renameChartTabAction,
  saveChartPrefsAction,
  saveChartTabAction,
} from "@/app/(app)/graficos/actions";

type Db = Parameters<typeof listChartTabs>[0];
const db = () => state.db as Db;
let other = 0;

beforeEach(() => {
  resetChartLimits();
  const d = testDb();
  state.db = d;
  const mk = (u: string) => d.insert(users).values({ username: u, passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0].id;
  state.userId = mk("ana");
  other = mk("bia");
});

describe("abas de gráficos na conta", () => {
  test("primeira visita: uma aba padrão; criar, renomear e apagar", async () => {
    expect(listChartTabs(db(), state.userId)).toEqual([expect.objectContaining({ name: "Gráfico 1", state: defaultTab() })]);
    const r = await createChartTabAction("Altcoins");
    expect(r).toEqual({ ok: true, id: expect.any(Number) });
    const id = (r as { id: number }).id;
    expect(listChartTabs(db(), state.userId).map((t) => t.name)).toEqual(["Gráfico 1", "Altcoins"]);
    expect(await renameChartTabAction(id, "  Majors ")).toEqual({ ok: true });
    expect(await renameChartTabAction(id, "")).toMatchObject({ ok: false });
    expect(await deleteChartTabAction(id)).toEqual({ ok: true });
    expect(listChartTabs(db(), state.userId)).toHaveLength(1);
  });

  test("até 10 abas; a última não pode ser apagada", async () => {
    listChartTabs(db(), state.userId); // abre a tela: cria "Gráfico 1"
    for (let i = 0; i < LIMITS.tabs - 1; i++) expect((await createChartTabAction(`A${i}`)).ok).toBe(true);
    expect(await createChartTabAction("Demais")).toEqual({ ok: false, error: `Limite de ${LIMITS.tabs} abas` });
    const tabs = listChartTabs(db(), state.userId);
    for (const t of tabs.slice(1)) await deleteChartTabAction(t.id);
    expect(await deleteChartTabAction(tabs[0].id)).toEqual({ ok: false, error: "Mantenha pelo menos uma aba" });
  });

  test("salvar o estado valida tudo que vem do navegador", async () => {
    const [tab] = listChartTabs(db(), state.userId);
    const good = { layout: 2, panes: [{ ...defaultTab().panes[0], symbol: "SOLETH", interval: "15m" }] };
    expect(await saveChartTabAction(tab.id, good)).toEqual({ ok: true });
    expect(listChartTabs(db(), state.userId)[0].state.panes).toHaveLength(2);
    expect(listChartTabs(db(), state.userId)[0].state.panes[0].symbol).toBe("SOLETH");
    expect((await saveChartTabAction(tab.id, { layout: 3, panes: [] })).ok).toBe(false);
    expect((await saveChartTabAction(tab.id, "x" as never)).ok).toBe(false);
    expect((await saveChartTabAction("1" as never, good)).ok).toBe(false);
  });

  test("ninguém mexe nas abas de outra pessoa", async () => {
    listChartTabs(db(), other);
    const theirs = listChartTabs(db(), other)[0];
    const nf = { ok: false, error: "Aba não encontrada" };
    expect(await saveChartTabAction(theirs.id, defaultTab())).toEqual(nf);
    expect(await renameChartTabAction(theirs.id, "x")).toEqual(nf);
    expect(await deleteChartTabAction(theirs.id)).toEqual(nf);
    expect(listChartTabs(db(), other)[0].name).toBe("Gráfico 1");
  });

  test("preferências de ferramentas e aba aberta", async () => {
    expect(getChartPrefs(db(), state.userId).tools.favorites.length).toBeGreaterThan(0);
    const [tab] = listChartTabs(db(), state.userId);
    const known = CHART_TOOLS.map((t) => t.name);
    expect(await saveChartPrefsAction({ visible: ["segment"], favorites: ["fibonacciLine"], known }, tab.id)).toEqual({ ok: true });
    expect(getChartPrefs(db(), state.userId)).toEqual({ tools: { visible: ["segment", "fibonacciLine"], favorites: ["fibonacciLine"], intervals: DEFAULT_INTERVALS, favoriteIndicators: [], favoriteSymbols: [], known }, activeTabId: tab.id });
    expect((await saveChartPrefsAction("x" as never, null)).ok).toBe(false);
    // aba de outra pessoa não vira a aba aberta
    const theirs = listChartTabs(db(), other)[0];
    expect(await saveChartPrefsAction({ visible: [], favorites: [] }, theirs.id)).toEqual({ ok: false, error: "Aba não encontrada" });
  });

  test("limite de alterações por minuto", async () => {
    const [tab] = listChartTabs(db(), state.userId);
    for (let i = 0; i < 120; i++) await saveChartTabAction(tab.id, defaultTab());
    expect(await saveChartTabAction(tab.id, defaultTab())).toEqual({ ok: false, error: "Muitas alterações seguidas. Aguarde um minuto." });
  });
});
