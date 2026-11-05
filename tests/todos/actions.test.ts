import { beforeEach, describe, expect, test, vi } from "vitest";
import { testDb } from "../helpers/db";
import { users } from "@/db/schema";
import { listEvents, listGroups, listQuickNotes, listTasks } from "@/lib/todos/store";
import { resetTodoLimits } from "@/lib/todos/limit";

const state = vi.hoisted(() => ({ db: null as unknown, userId: 0 }));
vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: () => state.db }));
vi.mock("@/lib/auth/current", () => ({ requireUser: async () => ({ id: state.userId }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import {
  addItemAction,
  createEventAction,
  createGroupAction,
  createQuickNoteAction,
  createTaskAction,
  deleteGroupAction,
  moveItemAction,
  setTaskDoneAction,
  toggleItemAction,
  updateTaskAction,
} from "@/app/(app)/pendencias/actions";

type Db = Parameters<typeof listTasks>[0];
const db = () => state.db as Db;

beforeEach(() => {
  resetTodoLimits();
  const d = testDb();
  state.db = d;
  state.userId = d.insert(users).values({ username: "ana", passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0].id;
});

describe("tarefas", () => {
  test("tarefa simples só com título; campos opcionais validados", async () => {
    expect(await createTaskAction({ title: "  Comprar pão " })).toEqual({ ok: true });
    expect(listTasks(db(), state.userId)[0]).toMatchObject({ title: "Comprar pão", priority: 2, status: "pending", dueDate: null });
    expect((await createTaskAction({ title: "" })).ok).toBe(false);
    expect((await createTaskAction({ title: "x‮y" })).ok).toBe(false);
    expect(await createTaskAction({ title: "X", priority: 5 as 3 })).toEqual({ ok: false, error: "Prioridade inválida" });
    expect(await createTaskAction({ title: "X", dueDate: "2026-02-30" })).toEqual({ ok: false, error: "Data inválida" });
    expect(await createTaskAction({ title: "X", dueTime: "25:00" })).toEqual({ ok: false, error: "Horário inválido" });
    expect(await createTaskAction({ title: "X", status: "hack" as "done" })).toEqual({ ok: false, error: "Status inválido" });
    expect((await createTaskAction({ title: "X", description: "d".repeat(5001) })).ok).toBe(false);
    expect((await createTaskAction({ title: "X", checklist: ["ok", ""] })).ok).toBe(false);
    expect((await createTaskAction({ title: "X", checklist: "a" as unknown as string[] })).ok).toBe(false);
    expect(listTasks(db(), state.userId)).toHaveLength(1);
  });

  test("editar, concluir e checklist pelo navegador", async () => {
    await createTaskAction({ title: "Orçamento", checklist: ["a", "b"], dueDate: "2026-11-03", dueTime: "09:00", priority: 3 });
    const t = listTasks(db(), state.userId)[0];
    expect(await updateTaskAction(t.id, { title: "Orçamento v2", dueDate: null })).toEqual({ ok: true });
    expect(listTasks(db(), state.userId)[0]).toMatchObject({ title: "Orçamento v2", dueDate: null });
    expect(await toggleItemAction(t.checklist[0].id, true)).toEqual({ ok: true });
    expect(listTasks(db(), state.userId)[0].status).toBe("in_progress");
    expect(await moveItemAction(t.checklist[1].id, -1)).toEqual({ ok: true });
    expect(await addItemAction(t.id, "c")).toEqual({ ok: true });
    expect(await setTaskDoneAction(t.id, true)).toEqual({ ok: true });
    expect(listTasks(db(), state.userId)[0].checklist.every((i) => i.done)).toBe(true);
  });

  test("ids e tipos inválidos são recusados sem lançar", async () => {
    expect(await updateTaskAction("1" as unknown as number, { title: "x" })).toEqual({ ok: false, error: "Tarefa não encontrada" });
    expect(await updateTaskAction(1, "x" as unknown as object)).toEqual({ ok: false, error: "Dados inválidos" });
    expect(await updateTaskAction(1, { title: 5 as unknown as string })).toEqual({ ok: false, error: "Título inválido" });
    expect(await toggleItemAction(1.5, true)).toEqual({ ok: false, error: "Item não encontrado" });
    expect(await toggleItemAction(1, "sim" as unknown as boolean)).toEqual({ ok: false, error: "Item não encontrado" });
    expect(await moveItemAction(1, 2 as 1)).toEqual({ ok: false, error: "Item não encontrado" });
    expect(await setTaskDoneAction(1, "x" as unknown as boolean)).toEqual({ ok: false, error: "Tarefa não encontrada" });
  });
});

describe("grupos, compromissos e notas", () => {
  test("grupos com tipo validado; excluir com destino", async () => {
    expect(await createGroupAction("Mestrado", "project")).toEqual({ ok: true });
    expect(await createGroupAction("X", "hack" as "project")).toEqual({ ok: false, error: "Tipo inválido" });
    const g = listGroups(db(), state.userId)[0];
    expect(await deleteGroupAction(g.id, "2" as unknown as number)).toEqual({ ok: false, error: "Grupo não encontrado" });
    expect(await deleteGroupAction(g.id, null)).toEqual({ ok: true });
  });

  test("compromisso e nota rápida validados", async () => {
    expect(await createEventAction({ title: "Reunião", date: "2026-11-10", time: "14:00", categoryId: null, description: "", status: "scheduled" })).toEqual({ ok: true });
    expect((await createEventAction({ title: "R", date: "", time: null, categoryId: null, description: "", status: "scheduled" })).ok).toBe(false);
    expect(listEvents(db(), state.userId)).toHaveLength(1);
    expect(await createQuickNoteAction("Pesquisar cursos\nde IA")).toEqual({ ok: true });
    expect((await createQuickNoteAction("   ")).ok).toBe(false);
    expect(listQuickNotes(db(), state.userId)[0].text).toBe("Pesquisar cursos\nde IA");
  });

  test("limite de 120 alterações por minuto", async () => {
    for (let i = 0; i < 120; i++) await createQuickNoteAction(`n${i}`);
    expect(await createQuickNoteAction("extra")).toEqual({ ok: false, error: "Muitas alterações seguidas. Aguarde um minuto." });
  });
});
