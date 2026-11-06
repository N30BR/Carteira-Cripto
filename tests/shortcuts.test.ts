import { describe, expect, test } from "vitest";
import { SHORTCUTS, matches, searchShortcuts, shortcutSections } from "@/lib/shortcuts";

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("registro de atalhos", () => {
  test("cada atalho tem id único, teclas, ação, descrição e quando vale", () => {
    expect(new Set(SHORTCUTS.map((s) => s.id)).size).toBe(SHORTCUTS.length);
    for (const s of SHORTCUTS) {
      expect(s.keys.length).toBeGreaterThan(0);
      expect(s.action && s.description && s.when).toBeTruthy();
    }
  });

  test("Gráficos: Delete, Ctrl+D, Ctrl+O e Esc reconhecidos (Ctrl ou ⌘); Ctrl+Shift+D não", () => {
    expect(matches(key("Delete"), "charts.delete")).toBe(true);
    expect(matches(key("d", { ctrlKey: true }), "charts.duplicate")).toBe(true);
    expect(matches(key("D", { metaKey: true }), "charts.duplicate")).toBe(true);
    expect(matches(key("d", { ctrlKey: true, shiftKey: true }), "charts.duplicate")).toBe(false);
    expect(matches(key("d"), "charts.duplicate")).toBe(false);
    expect(matches(key("o", { ctrlKey: true }), "charts.hide")).toBe(true);
    expect(matches(key("Escape"), "charts.cancel")).toBe(true);
    expect(matches(key("Delete"), "nao-existe")).toBe(false);
  });

  test("busca por ação, teclas ou descrição, sem diferenciar acentos", () => {
    expect(searchShortcuts(SHORTCUTS, "duplicar").map((s) => s.id)).toEqual(["charts.duplicate"]);
    expect(searchShortcuts(SHORTCUTS, "ctrl + o").map((s) => s.id)).toContain("charts.hide");
    expect(searchShortcuts(SHORTCUTS, "edicao").length).toBeGreaterThan(0);
    expect(searchShortcuts(SHORTCUTS, "")).toHaveLength(SHORTCUTS.length);
    expect(searchShortcuts(SHORTCUTS, "xyzxyz")).toEqual([]);
  });

  test("seções: só as que têm atalhos e algum módulo ligado; Cripto e R$ some só com os dois desligados", () => {
    const all = shortcutSections([]);
    expect(all.map((s) => s.id)).toEqual(["charts", "invoices", "todos", "tables"]);
    expect(all.every((s) => s.shortcuts.length > 0)).toBe(true);
    expect(shortcutSections(["charts"]).map((s) => s.id)).not.toContain("charts");
    expect(shortcutSections(["crypto"]).map((s) => s.id)).toContain("tables");
    expect(shortcutSections(["crypto", "fiat"]).map((s) => s.id)).not.toContain("tables");
  });
});
