// Casos da revisão de segurança de Faturas, Lançamentos e Pendências.
import { describe, expect, test } from "vitest";
import { testDb } from "./helpers/db";
import { todoChecklist, todoTasks, users } from "@/db/schema";
import { cleanNotes, validateLabel } from "@/lib/validation";
import { planFromForm } from "@/lib/cards/installments";
import { createExpense, hasExpenses } from "@/lib/cards/store";
import { ensureDefaultAccounts, listCardAccounts } from "@/lib/cards/accounts";
import { DEFAULT_CATEGORIES, deleteCategory, ensureDefaultCategories, listCategories } from "@/lib/cards/categories";
import {
  LIMITS,
  createGroup,
  createTask,
  deleteGroup,
  ensureDefaultGroups,
  listGroups,
  listTasks,
  toggleItem,
  updateGroup,
  updateTask,
} from "@/lib/todos/store";

function setup() {
  const db = testDb();
  const u = db.insert(users).values({ username: "ana", passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0].id;
  return { db, u };
}

describe("Pendências: carga e limites", () => {
  test("listTasks agrupa itens e notas em tempo linear (2000 tarefas × 20 itens em menos de 200 ms)", () => {
    const { db, u } = setup();
    const now = new Date();
    const tasks = db
      .insert(todoTasks)
      .values(Array.from({ length: 2000 }, (_, i) => ({ userId: u, title: `T${i}`, createdAt: now, updatedAt: now })))
      .returning({ id: todoTasks.id })
      .all();
    const items = tasks.flatMap((t) => Array.from({ length: 20 }, (_, p) => ({ taskId: t.id, text: "x", position: p, done: false })));
    for (let i = 0; i < items.length; i += 5000) db.insert(todoChecklist).values(items.slice(i, i + 5000)).run();
    // Melhor de 3 medições: imune a picos de carga da máquina; a versão quadrática levava ~700 ms.
    let best = Infinity;
    let list = listTasks(db, u);
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      list = listTasks(db, u);
      best = Math.min(best, performance.now() - t0);
    }
    expect(best).toBeLessThan(200);
    expect(list[1999].checklist).toHaveLength(20);
  });

  test("limites menores por tarefa", () => {
    expect(LIMITS.items).toBeLessThanOrEqual(30);
    expect(LIMITS.notes).toBeLessThanOrEqual(20);
    expect(LIMITS.tasks).toBeLessThanOrEqual(1000);
  });

  test("teto total de texto por pessoa nas pendências", () => {
    const { db, u } = setup();
    const original = LIMITS.textChars;
    LIMITS.textChars = 12_000;
    try {
      expect(createTask(db, u, { title: "A", description: "d".repeat(5000) }).ok).toBe(true);
      expect(createTask(db, u, { title: "B", description: "d".repeat(5000) }).ok).toBe(true);
      expect(createTask(db, u, { title: "C", description: "d".repeat(5000) })).toEqual({
        ok: false,
        error: "Limite de texto das pendências atingido. Apague tarefas ou notas antigas.",
      });
      const id = listTasks(db, u)[0].id;
      expect(updateTask(db, u, id, { description: "d".repeat(9000) }).ok).toBe(false);
      expect(updateTask(db, u, id, { description: "curta" }).ok).toBe(true);
    } finally {
      LIMITS.textChars = original;
    }
  });
});

describe("Pendências: grupos e status", () => {
  test("trocar o tipo do grupo não apaga a outra classificação das tarefas", () => {
    const { db, u } = setup();
    createGroup(db, u, { name: "Estudos", kind: "category" });
    createGroup(db, u, { name: "TCC", kind: "project" });
    const [estudos, tcc] = listGroups(db, u);
    createTask(db, u, { title: "Com categoria", categoryId: estudos.id, projectId: tcc.id });
    createTask(db, u, { title: "Sem categoria", projectId: tcc.id });
    expect(updateGroup(db, u, tcc.id, { name: "TCC", kind: "category" })).toEqual({ ok: true });
    const byTitle = Object.fromEntries(listTasks(db, u).map((t) => [t.title, t]));
    expect(byTitle["Com categoria"]).toMatchObject({ categoryId: estudos.id, projectId: null });
    expect(byTitle["Sem categoria"]).toMatchObject({ categoryId: tcc.id, projectId: null });
  });

  test("escolher 'Pendente' ou 'Em andamento' no status não desmarca o checklist", () => {
    const { db, u } = setup();
    createTask(db, u, { title: "X", checklist: ["a", "b", "c"] });
    let t = listTasks(db, u)[0];
    toggleItem(db, u, t.checklist[0].id, true);
    toggleItem(db, u, t.checklist[1].id, true);
    expect(updateTask(db, u, t.id, { status: "pending" })).toEqual({ ok: true });
    t = listTasks(db, u)[0];
    expect(t.status).toBe("pending");
    expect(t.checklist.filter((i) => i.done)).toHaveLength(2);
  });

  test("categorias padrão não voltam depois de apagadas", () => {
    const { db, u } = setup();
    ensureDefaultGroups(db, u);
    for (const g of listGroups(db, u)) deleteGroup(db, u, g.id, null);
    ensureDefaultGroups(db, u);
    expect(listGroups(db, u)).toEqual([]);

    ensureDefaultCategories(db, u);
    expect(listCategories(db, u)).toHaveLength(DEFAULT_CATEGORIES.length);
    for (const c of listCategories(db, u)) deleteCategory(db, u, c.id);
    ensureDefaultCategories(db, u);
    expect(listCategories(db, u)).toEqual([]);
  });
});

describe("Faturas", () => {
  test("parcelas não podem passar de 2099-12", () => {
    expect(planFromForm({ amountCents: 1000, mode: "total", current: 1, total: 12, refMonth: "2099-06", currentPaid: false })).toEqual({
      ok: false,
      error: "As parcelas passariam de dezembro de 2099",
    });
    expect(planFromForm({ amountCents: 1000, mode: "total", current: 1, total: 7, refMonth: "2099-06", currentPaid: false }).ok).toBe(true);
  });

  test("hasExpenses vê compras antigas (o estado vazio não depende do período)", () => {
    const { db, u } = setup();
    expect(hasExpenses(db, u)).toBe(false);
    ensureDefaultAccounts(db, u);
    createExpense(db, u, {
      description: "Antiga",
      totalCents: 100,
      installments: 1,
      firstInvoice: "2020-01",
      purchaseDate: "2020-01-10",
      accountId: listCardAccounts(db, u)[0].id,
      categoryId: null,
      notes: "",
      paidNumbers: [],
    });
    expect(hasExpenses(db, u)).toBe(true);
  });
});

describe("textos", () => {
  test("emoji com junção (ZWJ) e seletor de variação são aceitos; caracteres invisíveis e de direção não", () => {
    expect(validateLabel("Viagem 👨‍👩‍👧", 40, "um nome")).toEqual({ ok: true, value: "Viagem 👨‍👩‍👧" });
    expect(validateLabel("Coração ❤️", 40, "um nome").ok).toBe(true);
    expect(cleanNotes("Família 👨‍👩‍👧", 100)).toEqual({ ok: true, value: "Família 👨‍👩‍👧" });
    expect(validateLabel("a​b", 40, "um nome").ok).toBe(false);
    expect(validateLabel("a‮b", 40, "um nome").ok).toBe(false);
    expect(validateLabel("a﻿b", 40, "um nome").ok).toBe(false);
    expect(cleanNotes("a‮b​c", 100)).toEqual({ ok: true, value: "abc" });
  });
});
