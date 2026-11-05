import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { quickNotes, todoChecklist, todoEvents, todoGroups, todoNotes, todoTasks } from "@/db/schema";
import { statusAfterChecklist, type EventView, type TaskStatus, type TaskView } from "./logic";

export type Result = { ok: true } | { ok: false; error: string };
export type GroupKind = "category" | "project";
export type Group = { id: number; name: string; kind: GroupKind };

export const LIMITS = { groups: 100, tasks: 2000, items: 50, notes: 50, events: 2000, quickNotes: 500 };
export const DEFAULT_GROUPS = ["Profissional", "Estudos", "Financeiro", "Casa"];

const err = (error: string): Result => ({ ok: false, error });
const TASK_NF = err("Tarefa não encontrada");
const ITEM_NF = err("Item não encontrado");
const NOTE_NF = err("Nota não encontrada");
const GROUP_NF = err("Grupo não encontrado");
const EVENT_NF = err("Compromisso não encontrado");

const countWhere = (db: Db, table: typeof todoTasks | typeof todoEvents | typeof quickNotes | typeof todoGroups, userId: number) =>
  db.select({ n: count() }).from(table).where(eq(table.userId, userId)).all()[0].n;

// ---------- grupos (categorias e projetos) ----------

export function listGroups(db: Db, userId: number): Group[] {
  return db
    .select({ id: todoGroups.id, name: todoGroups.name, kind: todoGroups.kind })
    .from(todoGroups)
    .where(eq(todoGroups.userId, userId))
    .orderBy(asc(todoGroups.id))
    .all() as Group[];
}

/** Na primeira visita (sem grupos e sem tarefas), cria as 4 categorias padrão. */
export function ensureDefaultGroups(db: Db, userId: number): void {
  if (countWhere(db, todoGroups, userId) > 0 || countWhere(db, todoTasks, userId) > 0) return;
  const now = new Date();
  db.insert(todoGroups)
    .values(DEFAULT_GROUPS.map((name) => ({ userId, name, kind: "category", createdAt: now })))
    .run();
}

function getGroup(db: Db, userId: number, id: number) {
  return db
    .select()
    .from(todoGroups)
    .where(and(eq(todoGroups.id, id), eq(todoGroups.userId, userId)))
    .get();
}

function groupNameTaken(db: Db, userId: number, name: string, kind: GroupKind, exceptId?: number) {
  const row = db
    .select({ id: todoGroups.id })
    .from(todoGroups)
    .where(and(eq(todoGroups.userId, userId), eq(todoGroups.kind, kind), eq(todoGroups.name, name)))
    .get();
  return !!row && row.id !== exceptId;
}

export function createGroup(db: Db, userId: number, g: { name: string; kind: GroupKind }): Result {
  if (groupNameTaken(db, userId, g.name, g.kind)) return err("Já existe um grupo com esse nome");
  if (countWhere(db, todoGroups, userId) >= LIMITS.groups) return err(`Limite de ${LIMITS.groups} grupos atingido`);
  db.insert(todoGroups).values({ userId, name: g.name, kind: g.kind, createdAt: new Date() }).run();
  return { ok: true };
}

/** Renomeia e/ou troca o tipo; ao trocar, as tarefas passam a usar o grupo no campo do novo tipo. */
export function updateGroup(db: Db, userId: number, id: number, g: { name: string; kind: GroupKind }): Result {
  const current = getGroup(db, userId, id);
  if (!current) return GROUP_NF;
  if (groupNameTaken(db, userId, g.name, g.kind, id)) return err("Já existe um grupo com esse nome");
  db.transaction((tx) => {
    tx.update(todoGroups).set({ name: g.name, kind: g.kind }).where(eq(todoGroups.id, id)).run();
    if (current.kind !== g.kind) {
      const [from, to] = current.kind === "category" ? ["categoryId", "projectId"] : ["projectId", "categoryId"];
      const fromCol = from === "categoryId" ? todoTasks.categoryId : todoTasks.projectId;
      tx.update(todoTasks)
        .set({ [from]: null, [to]: id })
        .where(and(eq(todoTasks.userId, userId), eq(fromCol, id)))
        .run();
      if (current.kind === "category") {
        tx.update(todoEvents).set({ categoryId: null }).where(eq(todoEvents.categoryId, id)).run();
      }
    }
  });
  return { ok: true };
}

/** Exclui o grupo movendo as tarefas (e compromissos) para `destId` do mesmo tipo, ou deixando sem grupo. */
export function deleteGroup(db: Db, userId: number, id: number, destId: number | null): Result {
  const current = getGroup(db, userId, id);
  if (!current) return GROUP_NF;
  if (destId !== null) {
    const dest = getGroup(db, userId, destId);
    if (!dest || dest.kind !== current.kind || dest.id === id) return err("Escolha um destino do mesmo tipo");
  }
  db.transaction((tx) => {
    if (current.kind === "category") {
      tx.update(todoTasks).set({ categoryId: destId }).where(eq(todoTasks.categoryId, id)).run();
      tx.update(todoEvents).set({ categoryId: destId }).where(eq(todoEvents.categoryId, id)).run();
    } else {
      tx.update(todoTasks).set({ projectId: destId }).where(eq(todoTasks.projectId, id)).run();
    }
    tx.delete(todoGroups).where(eq(todoGroups.id, id)).run();
  });
  return { ok: true };
}

function checkGroups(db: Db, userId: number, categoryId?: number | null, projectId?: number | null): Result {
  if (categoryId != null && getGroup(db, userId, categoryId)?.kind !== "category") return err("Categoria inválida");
  if (projectId != null && getGroup(db, userId, projectId)?.kind !== "project") return err("Projeto inválido");
  return { ok: true };
}

// ---------- tarefas ----------

export type TaskInput = {
  title: string;
  description?: string;
  categoryId?: number | null;
  projectId?: number | null;
  priority?: 1 | 2 | 3;
  dueDate?: string | null;
  dueTime?: string | null;
  status?: TaskStatus;
  checklist?: string[];
  notes?: string[];
};

export type TaskPatch = Partial<Omit<TaskInput, "checklist" | "notes">>;

export function listTasks(db: Db, userId: number): TaskView[] {
  const tasks = db.select().from(todoTasks).where(eq(todoTasks.userId, userId)).all();
  if (!tasks.length) return [];
  const ids = tasks.map((t) => t.id);
  const items = db.select().from(todoChecklist).where(inArray(todoChecklist.taskId, ids)).orderBy(asc(todoChecklist.position), asc(todoChecklist.id)).all();
  const notes = db.select().from(todoNotes).where(inArray(todoNotes.taskId, ids)).orderBy(asc(todoNotes.id)).all();
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    categoryId: t.categoryId,
    projectId: t.projectId,
    priority: Math.min(3, Math.max(1, t.priority)) as 1 | 2 | 3,
    dueDate: t.dueDate,
    dueTime: t.dueTime,
    status: t.status as TaskStatus,
    createdAt: t.createdAt.getTime(),
    updatedAt: t.updatedAt.getTime(),
    checklist: items.filter((i) => i.taskId === t.id).map((i) => ({ id: i.id, text: i.text, done: i.done, position: i.position })),
    notes: notes.filter((n) => n.taskId === t.id).map((n) => ({ id: n.id, text: n.text })),
  }));
}

function getTask(db: Db, userId: number, id: number) {
  return db
    .select()
    .from(todoTasks)
    .where(and(eq(todoTasks.id, id), eq(todoTasks.userId, userId)))
    .get();
}

export function createTask(db: Db, userId: number, t: TaskInput): { ok: true; id: number } | { ok: false; error: string } {
  const g = checkGroups(db, userId, t.categoryId, t.projectId);
  if (!g.ok) return g;
  if (countWhere(db, todoTasks, userId) >= LIMITS.tasks) return { ok: false, error: `Limite de ${LIMITS.tasks} tarefas atingido` };
  const items = (t.checklist ?? []).slice(0, LIMITS.items);
  const notes = (t.notes ?? []).slice(0, LIMITS.notes);
  const now = new Date();
  let id = 0;
  db.transaction((tx) => {
    const [row] = tx
      .insert(todoTasks)
      .values({
        userId,
        title: t.title,
        description: t.description ?? "",
        categoryId: t.categoryId ?? null,
        projectId: t.projectId ?? null,
        priority: t.priority ?? 2,
        dueDate: t.dueDate ?? null,
        dueTime: t.dueTime ?? null,
        status: t.status ?? "pending",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .all();
    id = row.id;
    if (items.length) {
      tx.insert(todoChecklist).values(items.map((text, position) => ({ taskId: id, text, position, done: t.status === "done" }))).run();
    }
    if (notes.length) tx.insert(todoNotes).values(notes.map((text) => ({ taskId: id, text, createdAt: now }))).run();
  });
  return { ok: true, id };
}

const touch = (db: Db, id: number, extra: Partial<typeof todoTasks.$inferInsert> = {}) =>
  db.update(todoTasks).set({ ...extra, updatedAt: new Date() }).where(eq(todoTasks.id, id)).run();

/** Marca/desmarca todos os itens junto com o status (concluída ↔ pendente). */
function setAllItems(db: Db, taskId: number, done: boolean) {
  db.update(todoChecklist).set({ done }).where(eq(todoChecklist.taskId, taskId)).run();
}

export function updateTask(db: Db, userId: number, id: number, patch: TaskPatch): Result {
  if (!getTask(db, userId, id)) return TASK_NF;
  const g = checkGroups(db, userId, patch.categoryId, patch.projectId);
  if (!g.ok) return g;
  db.transaction((tx) => {
    touch(tx as unknown as Db, id, patch);
    if (patch.status === "done") setAllItems(tx as unknown as Db, id, true);
    if (patch.status === "pending") setAllItems(tx as unknown as Db, id, false);
  });
  return { ok: true };
}

export function setTaskDone(db: Db, userId: number, id: number, done: boolean): Result {
  return updateTask(db, userId, id, { status: done ? "done" : "pending" });
}

export function deleteTask(db: Db, userId: number, id: number): Result {
  if (!getTask(db, userId, id)) return TASK_NF;
  db.delete(todoTasks).where(eq(todoTasks.id, id)).run();
  return { ok: true };
}

// ---------- checklist ----------

function getItem(db: Db, userId: number, itemId: number) {
  return db
    .select({ id: todoChecklist.id, taskId: todoChecklist.taskId, position: todoChecklist.position })
    .from(todoChecklist)
    .innerJoin(todoTasks, eq(todoTasks.id, todoChecklist.taskId))
    .where(and(eq(todoChecklist.id, itemId), eq(todoTasks.userId, userId)))
    .get();
}

/** Recalcula o status da tarefa a partir do checklist e atualiza a data de alteração. */
function syncStatus(db: Db, taskId: number) {
  const task = db.select({ status: todoTasks.status }).from(todoTasks).where(eq(todoTasks.id, taskId)).get();
  const items = db.select({ done: todoChecklist.done }).from(todoChecklist).where(eq(todoChecklist.taskId, taskId)).all();
  touch(db, taskId, { status: statusAfterChecklist(task!.status as TaskStatus, items) });
}

export function addItem(db: Db, userId: number, taskId: number, text: string): Result {
  if (!getTask(db, userId, taskId)) return TASK_NF;
  const items = db.select({ position: todoChecklist.position }).from(todoChecklist).where(eq(todoChecklist.taskId, taskId)).all();
  if (items.length >= LIMITS.items) return err(`Limite de ${LIMITS.items} itens atingido`);
  const position = items.reduce((m, i) => Math.max(m, i.position + 1), 0);
  db.transaction((tx) => {
    tx.insert(todoChecklist).values({ taskId, text, position, done: false }).run();
    syncStatus(tx as unknown as Db, taskId);
  });
  return { ok: true };
}

export function updateItem(db: Db, userId: number, itemId: number, text: string): Result {
  const item = getItem(db, userId, itemId);
  if (!item) return ITEM_NF;
  db.update(todoChecklist).set({ text }).where(eq(todoChecklist.id, itemId)).run();
  touch(db, item.taskId);
  return { ok: true };
}

export function toggleItem(db: Db, userId: number, itemId: number, done: boolean): Result {
  const item = getItem(db, userId, itemId);
  if (!item) return ITEM_NF;
  db.transaction((tx) => {
    tx.update(todoChecklist).set({ done }).where(eq(todoChecklist.id, itemId)).run();
    syncStatus(tx as unknown as Db, item.taskId);
  });
  return { ok: true };
}

export function deleteItem(db: Db, userId: number, itemId: number): Result {
  const item = getItem(db, userId, itemId);
  if (!item) return ITEM_NF;
  db.transaction((tx) => {
    tx.delete(todoChecklist).where(eq(todoChecklist.id, itemId)).run();
    syncStatus(tx as unknown as Db, item.taskId);
  });
  return { ok: true };
}

/** Troca o item de lugar com o vizinho de cima (-1) ou de baixo (+1). */
export function moveItem(db: Db, userId: number, itemId: number, dir: -1 | 1): Result {
  const item = getItem(db, userId, itemId);
  if (!item) return ITEM_NF;
  const items = db
    .select({ id: todoChecklist.id, position: todoChecklist.position })
    .from(todoChecklist)
    .where(eq(todoChecklist.taskId, item.taskId))
    .orderBy(asc(todoChecklist.position), asc(todoChecklist.id))
    .all();
  const i = items.findIndex((x) => x.id === itemId);
  const j = i + dir;
  if (j < 0 || j >= items.length) return { ok: true };
  [items[i], items[j]] = [items[j], items[i]];
  db.transaction((tx) => {
    items.forEach((x, position) => tx.update(todoChecklist).set({ position }).where(eq(todoChecklist.id, x.id)).run());
    touch(tx as unknown as Db, item.taskId);
  });
  return { ok: true };
}

// ---------- notas da tarefa ----------

function getNote(db: Db, userId: number, noteId: number) {
  return db
    .select({ id: todoNotes.id, taskId: todoNotes.taskId })
    .from(todoNotes)
    .innerJoin(todoTasks, eq(todoTasks.id, todoNotes.taskId))
    .where(and(eq(todoNotes.id, noteId), eq(todoTasks.userId, userId)))
    .get();
}

export function addNote(db: Db, userId: number, taskId: number, text: string): Result {
  if (!getTask(db, userId, taskId)) return TASK_NF;
  const [{ n }] = db.select({ n: count() }).from(todoNotes).where(eq(todoNotes.taskId, taskId)).all();
  if (n >= LIMITS.notes) return err(`Limite de ${LIMITS.notes} notas atingido`);
  db.insert(todoNotes).values({ taskId, text, createdAt: new Date() }).run();
  touch(db, taskId);
  return { ok: true };
}

export function updateNote(db: Db, userId: number, noteId: number, text: string): Result {
  const note = getNote(db, userId, noteId);
  if (!note) return NOTE_NF;
  db.update(todoNotes).set({ text }).where(eq(todoNotes.id, noteId)).run();
  touch(db, note.taskId);
  return { ok: true };
}

export function deleteNote(db: Db, userId: number, noteId: number): Result {
  const note = getNote(db, userId, noteId);
  if (!note) return NOTE_NF;
  db.delete(todoNotes).where(eq(todoNotes.id, noteId)).run();
  touch(db, note.taskId);
  return { ok: true };
}

// ---------- compromissos ----------

export type EventInput = Omit<EventView, "id"> & { categoryId: number | null; description: string };

export function listEvents(db: Db, userId: number): (EventView & { categoryId: number | null; description: string })[] {
  return db
    .select({
      id: todoEvents.id,
      title: todoEvents.title,
      date: todoEvents.date,
      time: todoEvents.time,
      status: todoEvents.status,
      categoryId: todoEvents.categoryId,
      description: todoEvents.description,
    })
    .from(todoEvents)
    .where(eq(todoEvents.userId, userId))
    .orderBy(asc(todoEvents.date), asc(todoEvents.time))
    .all() as (EventView & { categoryId: number | null; description: string })[];
}

function ownsEvent(db: Db, userId: number, id: number) {
  return !!db
    .select({ id: todoEvents.id })
    .from(todoEvents)
    .where(and(eq(todoEvents.id, id), eq(todoEvents.userId, userId)))
    .get();
}

export function createEvent(db: Db, userId: number, e: EventInput): Result {
  const g = checkGroups(db, userId, e.categoryId, null);
  if (!g.ok) return g;
  if (countWhere(db, todoEvents, userId) >= LIMITS.events) return err(`Limite de ${LIMITS.events} compromissos atingido`);
  db.insert(todoEvents).values({ userId, ...e, createdAt: new Date() }).run();
  return { ok: true };
}

export function updateEvent(db: Db, userId: number, id: number, e: EventInput): Result {
  if (!ownsEvent(db, userId, id)) return EVENT_NF;
  const g = checkGroups(db, userId, e.categoryId, null);
  if (!g.ok) return g;
  db.update(todoEvents).set(e).where(eq(todoEvents.id, id)).run();
  return { ok: true };
}

export function deleteEvent(db: Db, userId: number, id: number): Result {
  if (!ownsEvent(db, userId, id)) return EVENT_NF;
  db.delete(todoEvents).where(eq(todoEvents.id, id)).run();
  return { ok: true };
}

// ---------- notas rápidas ----------

export type QuickNote = { id: number; text: string; pinned: boolean };

/** Fixadas primeiro, depois as alteradas mais recentemente. */
export function listQuickNotes(db: Db, userId: number): QuickNote[] {
  return db
    .select({ id: quickNotes.id, text: quickNotes.text, pinned: quickNotes.pinned })
    .from(quickNotes)
    .where(eq(quickNotes.userId, userId))
    .orderBy(desc(quickNotes.pinned), desc(quickNotes.updatedAt), desc(quickNotes.id))
    .all();
}

function ownsQuickNote(db: Db, userId: number, id: number) {
  return db
    .select({ id: quickNotes.id, text: quickNotes.text })
    .from(quickNotes)
    .where(and(eq(quickNotes.id, id), eq(quickNotes.userId, userId)))
    .get();
}

export function createQuickNote(db: Db, userId: number, text: string): Result {
  if (countWhere(db, quickNotes, userId) >= LIMITS.quickNotes) return err(`Limite de ${LIMITS.quickNotes} notas atingido`);
  const now = new Date();
  db.insert(quickNotes).values({ userId, text, pinned: false, createdAt: now, updatedAt: now }).run();
  return { ok: true };
}

export function updateQuickNote(db: Db, userId: number, id: number, text: string): Result {
  if (!ownsQuickNote(db, userId, id)) return NOTE_NF;
  db.update(quickNotes).set({ text, updatedAt: new Date() }).where(eq(quickNotes.id, id)).run();
  return { ok: true };
}

export function setQuickNotePinned(db: Db, userId: number, id: number, pinned: boolean): Result {
  if (!ownsQuickNote(db, userId, id)) return NOTE_NF;
  db.update(quickNotes).set({ pinned }).where(eq(quickNotes.id, id)).run();
  return { ok: true };
}

export function deleteQuickNote(db: Db, userId: number, id: number): Result {
  if (!ownsQuickNote(db, userId, id)) return NOTE_NF;
  db.delete(quickNotes).where(eq(quickNotes.id, id)).run();
  return { ok: true };
}

/** A nota vira tarefa (título curto, texto completo na descrição se não couber) e sai das notas. */
export function convertQuickNote(db: Db, userId: number, id: number): Result {
  const note = ownsQuickNote(db, userId, id);
  if (!note) return NOTE_NF;
  const firstLine = note.text.split("\n")[0].trim();
  const title = firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine || "Nota";
  const description = title === note.text ? "" : note.text;
  if (countWhere(db, todoTasks, userId) >= LIMITS.tasks) return err(`Limite de ${LIMITS.tasks} tarefas atingido`);
  db.transaction((tx) => {
    const now = new Date();
    tx.insert(todoTasks).values({ userId, title, description, priority: 2, status: "pending", createdAt: now, updatedAt: now }).run();
    tx.delete(quickNotes).where(eq(quickNotes.id, id)).run();
  });
  return { ok: true };
}
