import { describe, expect, test } from "vitest";
import { testDb } from "../helpers/db";
import { todoChecklist, users } from "@/db/schema";
import {
  addItem,
  addNote,
  convertQuickNote,
  createEvent,
  createGroup,
  createQuickNote,
  createTask,
  deleteEvent,
  deleteGroup,
  deleteItem,
  deleteNote,
  deleteQuickNote,
  deleteTask,
  ensureDefaultGroups,
  listEvents,
  listGroups,
  listQuickNotes,
  listTasks,
  moveItem,
  setQuickNotePinned,
  setTaskDone,
  toggleItem,
  updateEvent,
  updateGroup,
  updateItem,
  updateNote,
  updateQuickNote,
  updateTask,
} from "@/lib/todos/store";

function setup() {
  const db = testDb();
  const mk = (username: string) =>
    db.insert(users).values({ username, passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0].id;
  return { db, a: mk("ana"), b: mk("bia") };
}
const ok = { ok: true };
const ev = (o: Partial<Parameters<typeof createEvent>[2]> = {}) => ({
  title: "Reunião",
  date: "2026-11-10",
  time: "14:00",
  categoryId: null,
  description: "",
  status: "scheduled" as const,
  ...o,
});

describe("grupos", () => {
  test("cria as 4 categorias padrão uma vez", () => {
    const { db, a } = setup();
    ensureDefaultGroups(db, a);
    ensureDefaultGroups(db, a);
    expect(listGroups(db, a).map((g) => [g.name, g.kind])).toEqual([
      ["Profissional", "category"],
      ["Estudos", "category"],
      ["Financeiro", "category"],
      ["Casa", "category"],
    ]);
  });

  test("excluir grupo move as tarefas para o destino, sem apagar tarefas", () => {
    const { db, a } = setup();
    createGroup(db, a, { name: "Mestrado", kind: "project" });
    createGroup(db, a, { name: "Pesquisa", kind: "project" });
    const [mestrado, pesquisa] = listGroups(db, a);
    createTask(db, a, { title: "Ler artigo", projectId: mestrado.id });
    expect(deleteGroup(db, a, mestrado.id, pesquisa.id)).toEqual(ok);
    expect(listTasks(db, a)[0].projectId).toBe(pesquisa.id);
    expect(deleteGroup(db, a, pesquisa.id, null)).toEqual(ok);
    expect(listTasks(db, a)[0].projectId).toBeNull();
    expect(listTasks(db, a)).toHaveLength(1);
  });

  test("destino precisa ser do mesmo tipo; renomear sem duplicar", () => {
    const { db, a } = setup();
    createGroup(db, a, { name: "Casa", kind: "category" });
    createGroup(db, a, { name: "IA", kind: "project" });
    const [casa, ia] = listGroups(db, a);
    expect(deleteGroup(db, a, casa.id, ia.id)).toEqual({ ok: false, error: "Escolha um destino do mesmo tipo" });
    expect(updateGroup(db, a, ia.id, { name: "IA / Automação", kind: "project" })).toEqual(ok);
    expect(createGroup(db, a, { name: "IA / Automação", kind: "project" })).toEqual({
      ok: false,
      error: "Já existe um grupo com esse nome",
    });
  });

  test("trocar o tipo de um grupo em uso move a ligação das tarefas", () => {
    const { db, a } = setup();
    createGroup(db, a, { name: "Mestrado", kind: "category" });
    const g = listGroups(db, a)[0];
    createTask(db, a, { title: "T", categoryId: g.id });
    expect(updateGroup(db, a, g.id, { name: "Mestrado", kind: "project" })).toEqual(ok);
    expect(listTasks(db, a)[0]).toMatchObject({ categoryId: null, projectId: g.id });
  });
});

describe("tarefas e checklist", () => {
  test("checklist recalcula status; marcar a tarefa conclui todos os itens", () => {
    const { db, a } = setup();
    const r = createTask(db, a, { title: "Orçamento", priority: 3, dueDate: "2026-11-03", checklist: ["A", "B", "C", "D"], notes: ["nota"] });
    expect(r).toEqual({ ok: true, id: expect.any(Number) });
    let t = listTasks(db, a)[0];
    expect(t).toMatchObject({ priority: 3, status: "pending", notes: [{ text: "nota" }] });
    expect(toggleItem(db, a, t.checklist[0].id, true)).toEqual(ok);
    t = listTasks(db, a)[0];
    expect(t.status).toBe("in_progress");
    expect(setTaskDone(db, a, t.id, true)).toEqual(ok);
    t = listTasks(db, a)[0];
    expect(t.status).toBe("done");
    expect(t.checklist.every((i) => i.done)).toBe(true);
    expect(setTaskDone(db, a, t.id, false)).toEqual(ok);
    t = listTasks(db, a)[0];
    expect(t.status).toBe("pending");
    expect(t.checklist.some((i) => i.done)).toBe(false);
  });

  test("itens: editar, mover e excluir; status acompanha", () => {
    const { db, a } = setup();
    createTask(db, a, { title: "X", checklist: ["um", "dois"] });
    let t = listTasks(db, a)[0];
    expect(updateItem(db, a, t.checklist[0].id, "primeiro")).toEqual(ok);
    expect(moveItem(db, a, t.checklist[1].id, -1)).toEqual(ok);
    t = listTasks(db, a)[0];
    expect(t.checklist.map((i) => i.text)).toEqual(["dois", "primeiro"]);
    toggleItem(db, a, t.checklist[0].id, true);
    expect(deleteItem(db, a, t.checklist[1].id)).toEqual(ok);
    expect(listTasks(db, a)[0].status).toBe("done");
    expect(addItem(db, a, t.id, "novo")).toEqual(ok);
    expect(listTasks(db, a)[0].status).toBe("in_progress");
  });

  test("editar campos valida categoria/projeto do próprio usuário e do tipo certo", () => {
    const { db, a, b } = setup();
    ensureDefaultGroups(db, a);
    const cat = listGroups(db, a)[0];
    createTask(db, a, { title: "X" });
    const id = listTasks(db, a)[0].id;
    expect(updateTask(db, a, id, { categoryId: cat.id, priority: 1, dueDate: "2026-11-10", dueTime: "09:30" })).toEqual(ok);
    expect(listTasks(db, a)[0]).toMatchObject({ categoryId: cat.id, priority: 1, dueDate: "2026-11-10", dueTime: "09:30" });
    expect(updateTask(db, a, id, { projectId: cat.id })).toEqual({ ok: false, error: "Projeto inválido" });
    ensureDefaultGroups(db, b);
    expect(updateTask(db, a, id, { categoryId: listGroups(db, b)[0].id })).toEqual({ ok: false, error: "Categoria inválida" });
  });

  test("status manual 'concluída' marca os itens; 'em andamento' é mantido", () => {
    const { db, a } = setup();
    createTask(db, a, { title: "X", checklist: ["a"] });
    const id = listTasks(db, a)[0].id;
    updateTask(db, a, id, { status: "in_progress" });
    expect(listTasks(db, a)[0].status).toBe("in_progress");
    updateTask(db, a, id, { status: "done" });
    expect(listTasks(db, a)[0].checklist[0].done).toBe(true);
  });

  test("excluir tarefa remove itens e notas", () => {
    const { db, a } = setup();
    createTask(db, a, { title: "X", checklist: ["a"], notes: ["n"] });
    expect(deleteTask(db, a, listTasks(db, a)[0].id)).toEqual(ok);
    expect(db.select().from(todoChecklist).all()).toEqual([]);
  });
});

describe("compromissos e notas rápidas", () => {
  test("compromisso: criar, editar, excluir", () => {
    const { db, a } = setup();
    expect(createEvent(db, a, ev())).toEqual(ok);
    const e = listEvents(db, a)[0];
    expect(updateEvent(db, a, e.id, ev({ title: "Reunião IA", time: null, status: "done" }))).toEqual(ok);
    expect(listEvents(db, a)[0]).toMatchObject({ title: "Reunião IA", status: "done", time: null });
    expect(deleteEvent(db, a, e.id)).toEqual(ok);
    expect(listEvents(db, a)).toEqual([]);
  });

  test("nota rápida: fixadas primeiro; virar tarefa remove a nota", () => {
    const { db, a } = setup();
    createQuickNote(db, a, "Pesquisar cursos de IA (até sexta)");
    createQuickNote(db, a, "Revisar metas");
    const metas = listQuickNotes(db, a).find((x) => x.text === "Revisar metas")!;
    expect(setQuickNotePinned(db, a, metas.id, true)).toEqual(ok);
    expect(listQuickNotes(db, a)[0].text).toBe("Revisar metas");
    expect(updateQuickNote(db, a, metas.id, "Revisar metas do mês")).toEqual(ok);
    const cursos = listQuickNotes(db, a).find((x) => x.text.startsWith("Pesquisar"))!;
    expect(convertQuickNote(db, a, cursos.id)).toEqual(ok);
    expect(listQuickNotes(db, a).map((x) => x.text)).toEqual(["Revisar metas do mês"]);
    expect(listTasks(db, a)[0].title).toBe("Pesquisar cursos de IA (até sexta)");
    expect(deleteQuickNote(db, a, metas.id)).toEqual(ok);
  });

  test("nota longa vira tarefa com título curto e texto completo na descrição", () => {
    const { db, a } = setup();
    const text = "x".repeat(150);
    createQuickNote(db, a, text);
    convertQuickNote(db, a, listQuickNotes(db, a)[0].id);
    const t = listTasks(db, a)[0];
    expect(t.title.length).toBeLessThanOrEqual(120);
    expect(t.description).toBe(text);
  });
});

describe("isolamento", () => {
  test("ninguém mexe nos dados de outra pessoa", () => {
    const { db, a, b } = setup();
    createGroup(db, a, { name: "Mestrado", kind: "project" });
    createTask(db, a, { title: "Dela", checklist: ["item"], notes: ["nota"] });
    createEvent(db, a, ev());
    createQuickNote(db, a, "Q");
    const t = listTasks(db, a)[0];
    const g = listGroups(db, a)[0];
    const e = listEvents(db, a)[0];
    const q = listQuickNotes(db, a)[0];
    const task = { ok: false, error: "Tarefa não encontrada" };
    const item = { ok: false, error: "Item não encontrado" };
    const note = { ok: false, error: "Nota não encontrada" };

    expect(listTasks(db, b)).toEqual([]);
    expect(listGroups(db, b)).toEqual([]);
    expect(listEvents(db, b)).toEqual([]);
    expect(listQuickNotes(db, b)).toEqual([]);
    expect(updateTask(db, b, t.id, { title: "hack" })).toEqual(task);
    expect(setTaskDone(db, b, t.id, true)).toEqual(task);
    expect(deleteTask(db, b, t.id)).toEqual(task);
    expect(addItem(db, b, t.id, "x")).toEqual(task);
    expect(addNote(db, b, t.id, "x")).toEqual(task);
    expect(toggleItem(db, b, t.checklist[0].id, true)).toEqual(item);
    expect(updateItem(db, b, t.checklist[0].id, "x")).toEqual(item);
    expect(deleteItem(db, b, t.checklist[0].id)).toEqual(item);
    expect(moveItem(db, b, t.checklist[0].id, 1)).toEqual(item);
    expect(updateNote(db, b, t.notes[0].id, "x")).toEqual(note);
    expect(deleteNote(db, b, t.notes[0].id)).toEqual(note);
    expect(updateGroup(db, b, g.id, { name: "x", kind: "project" })).toEqual({ ok: false, error: "Grupo não encontrado" });
    expect(deleteGroup(db, b, g.id, null)).toEqual({ ok: false, error: "Grupo não encontrado" });
    expect(updateEvent(db, b, e.id, ev())).toEqual({ ok: false, error: "Compromisso não encontrado" });
    expect(deleteEvent(db, b, e.id)).toEqual({ ok: false, error: "Compromisso não encontrado" });
    expect(updateQuickNote(db, b, q.id, "x")).toEqual(note);
    expect(setQuickNotePinned(db, b, q.id, true)).toEqual(note);
    expect(convertQuickNote(db, b, q.id)).toEqual(note);
    expect(deleteQuickNote(db, b, q.id)).toEqual(note);
    expect(createTask(db, b, { title: "x", projectId: g.id })).toEqual({ ok: false, error: "Projeto inválido" });

    const after = listTasks(db, a)[0];
    expect(after).toMatchObject({ title: "Dela", status: "pending" });
    expect(after.checklist[0]).toMatchObject({ text: "item", done: false });
    expect(listQuickNotes(db, a)).toHaveLength(1);
  });
});
