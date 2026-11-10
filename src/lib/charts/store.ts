import { and, asc, count, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { chartPrefs, chartTabs } from "@/db/schema";
import { LIMITS, defaultPrefs, defaultTab, sanitizePrefs, sanitizeTabState, type TabState, type ToolPrefs } from "./workspace";

export type Result = { ok: true } | { ok: false; error: string };
export type ChartTab = { id: number; name: string; state: TabState };

const NOT_FOUND: Result = { ok: false, error: "Aba não encontrada" };

function owns(db: Db, userId: number, id: number): boolean {
  return !!db.select({ id: chartTabs.id }).from(chartTabs).where(and(eq(chartTabs.id, id), eq(chartTabs.userId, userId))).get();
}

/** Abas da pessoa, na ordem; na primeira visita cria "Gráfico 1". Estados corrompidos voltam ao padrão. */
export function listChartTabs(db: Db, userId: number): ChartTab[] {
  const rows = db.select().from(chartTabs).where(eq(chartTabs.userId, userId)).orderBy(asc(chartTabs.position), asc(chartTabs.id)).all();
  if (!rows.length) {
    const [row] = db
      .insert(chartTabs)
      .values({ userId, name: "Gráfico 1", position: 0, state: JSON.stringify(defaultTab()), updatedAt: new Date() })
      .returning()
      .all();
    return [{ id: row.id, name: row.name, state: defaultTab() }];
  }
  return rows.map((r) => {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(r.state);
    } catch {}
    const s = sanitizeTabState(parsed);
    return { id: r.id, name: r.name, state: s.ok ? s.value : defaultTab() };
  });
}

export function createChartTab(db: Db, userId: number, name: string): { ok: true; id: number } | { ok: false; error: string } {
  const [{ n }] = db.select({ n: count() }).from(chartTabs).where(eq(chartTabs.userId, userId)).all();
  if (n >= LIMITS.tabs) return { ok: false, error: `Limite de ${LIMITS.tabs} abas` };
  const [row] = db
    .insert(chartTabs)
    .values({ userId, name, position: n, state: JSON.stringify(defaultTab()), updatedAt: new Date() })
    .returning({ id: chartTabs.id })
    .all();
  return { ok: true, id: row.id };
}

/** Salva o estado de uma aba (validado de novo aqui: o navegador não é confiável). */
export function saveChartTab(db: Db, userId: number, id: number, raw: unknown): Result {
  if (!owns(db, userId, id)) return NOT_FOUND;
  const s = sanitizeTabState(raw);
  if (!s.ok) return s;
  db.update(chartTabs).set({ state: JSON.stringify(s.value), updatedAt: new Date() }).where(eq(chartTabs.id, id)).run();
  return { ok: true };
}

export function renameChartTab(db: Db, userId: number, id: number, name: string): Result {
  if (!owns(db, userId, id)) return NOT_FOUND;
  db.update(chartTabs).set({ name, updatedAt: new Date() }).where(eq(chartTabs.id, id)).run();
  return { ok: true };
}

export function deleteChartTab(db: Db, userId: number, id: number): Result {
  if (!owns(db, userId, id)) return NOT_FOUND;
  const [{ n }] = db.select({ n: count() }).from(chartTabs).where(eq(chartTabs.userId, userId)).all();
  if (n <= 1) return { ok: false, error: "Mantenha pelo menos uma aba" };
  db.delete(chartTabs).where(eq(chartTabs.id, id)).run();
  return { ok: true };
}

/**
 * Nova ordem das abas (arrastar e soltar): a lista precisa ter exatamente as abas da pessoa (sem repetir, sem faltar,
 * sem abas de outra conta). Só a posição muda; o conteúdo de cada aba fica como está.
 */
export function reorderChartTabs(db: Db, userId: number, ids: unknown): Result {
  if (!Array.isArray(ids) || ids.length > LIMITS.tabs || !ids.every((x) => Number.isInteger(x))) return { ok: false, error: "Ordem inválida" };
  const mine = db.select({ id: chartTabs.id }).from(chartTabs).where(eq(chartTabs.userId, userId)).all().map((r) => r.id);
  const wanted = ids as number[];
  if (wanted.length !== mine.length || new Set(wanted).size !== wanted.length || !wanted.every((id) => mine.includes(id))) return { ok: false, error: "Ordem inválida" };
  db.transaction((tx) => {
    wanted.forEach((id, position) => tx.update(chartTabs).set({ position }).where(eq(chartTabs.id, id)).run());
  });
  return { ok: true };
}

export function getChartPrefs(db: Db, userId: number): { tools: ToolPrefs; activeTabId: number | null } {
  const row = db.select().from(chartPrefs).where(eq(chartPrefs.userId, userId)).get();
  if (!row) return { tools: defaultPrefs(), activeTabId: null };
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(row.tools);
  } catch {}
  const s = sanitizePrefs(parsed);
  return { tools: s.ok ? s.value : defaultPrefs(), activeTabId: row.activeTabId ?? null };
}

export function saveChartPrefs(db: Db, userId: number, raw: unknown, activeTabId: number | null): Result {
  const s = sanitizePrefs(raw);
  if (!s.ok) return s;
  if (activeTabId !== null && !owns(db, userId, activeTabId)) return NOT_FOUND;
  const values = { tools: JSON.stringify(s.value), activeTabId, updatedAt: new Date() };
  db.insert(chartPrefs)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: chartPrefs.userId, set: values })
    .run();
  return { ok: true };
}
