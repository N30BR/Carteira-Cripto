"use server";

import { getDb } from "@/db/client";
import { requireModule } from "@/lib/auth/modules";
import { allowChartChange } from "@/lib/charts/limit";
import { createChartTab, deleteChartTab, renameChartTab, reorderChartTabs, saveChartPrefs, saveChartTab, type Result } from "@/lib/charts/store";
import { LIMITS } from "@/lib/charts/workspace";
import { validateLabel } from "@/lib/validation";

const NOT_FOUND: Result = { ok: false, error: "Aba não encontrada" };
const TOO_MANY: Result = { ok: false, error: "Muitas alterações seguidas. Aguarde um minuto." };

// As páginas da aba Gráficos não são revalidadas: a tela já mostra o estado salvo, e recarregar
// a cada desenho seria pesado. Ao abrir de novo, o servidor lê o que foi salvo.

async function begin(): Promise<{ id: number } | Result> {
  const user = await requireModule("charts");
  if (!allowChartChange(user.id)) return TOO_MANY;
  return user;
}

export async function createChartTabAction(rawName: string): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const u = await begin();
  if ("ok" in u) return u as { ok: false; error: string };
  const name = validateLabel(String(rawName ?? ""), LIMITS.tabName, "um nome");
  if (!name.ok) return name;
  return createChartTab(getDb(), u.id, name.value);
}

export async function saveChartTabAction(id: number, state: unknown): Promise<Result> {
  const u = await begin();
  if ("ok" in u) return u;
  if (!Number.isInteger(id)) return NOT_FOUND;
  return saveChartTab(getDb(), u.id, id, state);
}

export async function renameChartTabAction(id: number, rawName: string): Promise<Result> {
  const u = await begin();
  if ("ok" in u) return u;
  if (!Number.isInteger(id)) return NOT_FOUND;
  const name = validateLabel(String(rawName ?? ""), LIMITS.tabName, "um nome");
  if (!name.ok) return name;
  return renameChartTab(getDb(), u.id, id, name.value);
}

export async function deleteChartTabAction(id: number): Promise<Result> {
  const u = await begin();
  if ("ok" in u) return u;
  if (!Number.isInteger(id)) return NOT_FOUND;
  return deleteChartTab(getDb(), u.id, id);
}

/** Nova ordem das abas (arrastar e soltar). */
export async function reorderChartTabsAction(ids: unknown): Promise<Result> {
  const u = await begin();
  if ("ok" in u) return u;
  return reorderChartTabs(getDb(), u.id, ids);
}

export async function saveChartPrefsAction(tools: unknown, activeTabId: number | null): Promise<Result> {
  const u = await begin();
  if ("ok" in u) return u;
  if (activeTabId !== null && !Number.isInteger(activeTabId)) return NOT_FOUND;
  return saveChartPrefs(getDb(), u.id, tools, activeTabId);
}
