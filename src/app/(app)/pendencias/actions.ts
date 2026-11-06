"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireModule } from "@/lib/auth/modules";
import { allowTodoChange } from "@/lib/todos/limit";
import type { TaskStatus } from "@/lib/todos/logic";
import * as store from "@/lib/todos/store";
import { cleanNotes, validateLabel } from "@/lib/validation";

type Result = { ok: true } | { ok: false; error: string };

const TOO_MANY: Result = { ok: false, error: "Muitas alterações seguidas. Aguarde um minuto." };
const nf = (what: "Tarefa" | "Item" | "Nota" | "Grupo" | "Compromisso"): Result => ({
  ok: false,
  error: `${what} não encontrad${what === "Tarefa" || what === "Nota" ? "a" : "o"}`,
});
const isId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;
const STATUSES: TaskStatus[] = ["pending", "in_progress", "done"];
const EVENT_STATUSES = ["scheduled", "done", "canceled"] as const;

/** Começa toda action: usuário logado e dentro do limite de alterações. */
async function begin(): Promise<{ userId: number } | { error: Result }> {
  const user = await requireModule("todos");
  if (!allowTodoChange(user.id)) return { error: TOO_MANY };
  return { userId: user.id };
}

function done(r: Result): Result {
  revalidatePath("/pendencias");
  return r;
}

function parseDate(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false, error: "Data inválida" };
  const [y, m, d] = raw.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (y < 2000 || y > 2099 || dt.toISOString().slice(0, 10) !== raw) return { ok: false, error: "Data inválida" };
  return { ok: true, value: raw };
}

function parseTime(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  return typeof raw === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw)
    ? { ok: true, value: raw }
    : { ok: false, error: "Horário inválido" };
}

const optionalId = (v: unknown) => v === null || v === undefined || isId(v);

/** Valida e normaliza os campos de tarefa vindos do navegador (só os presentes). */
function parseTaskFields(raw: unknown, requireTitle: boolean): { ok: true; value: store.TaskPatch } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Dados inválidos" };
  const f = raw as Record<string, unknown>;
  const out: store.TaskPatch = {};
  if (requireTitle || "title" in f) {
    if (typeof f.title !== "string") return { ok: false, error: "Título inválido" };
    const t = validateLabel(f.title, 120, "um título");
    if (!t.ok) return t;
    out.title = t.value;
  }
  if ("description" in f && f.description !== undefined) {
    if (typeof f.description !== "string") return { ok: false, error: "Descrição inválida" };
    const d = cleanNotes(f.description, 5000);
    if (!d.ok) return { ok: false, error: "A descrição pode ter até 5000 caracteres" };
    out.description = d.value;
  }
  if ("categoryId" in f) {
    if (!optionalId(f.categoryId)) return { ok: false, error: "Categoria inválida" };
    out.categoryId = (f.categoryId as number | null | undefined) ?? null;
  }
  if ("projectId" in f) {
    if (!optionalId(f.projectId)) return { ok: false, error: "Projeto inválido" };
    out.projectId = (f.projectId as number | null | undefined) ?? null;
  }
  if ("priority" in f && f.priority !== undefined) {
    if (f.priority !== 1 && f.priority !== 2 && f.priority !== 3) return { ok: false, error: "Prioridade inválida" };
    out.priority = f.priority;
  }
  if ("dueDate" in f) {
    if (f.dueDate === null || f.dueDate === undefined || f.dueDate === "") out.dueDate = null;
    else {
      const d = parseDate(f.dueDate);
      if (!d.ok) return d;
      out.dueDate = d.value;
    }
  }
  if ("dueTime" in f) {
    if (f.dueTime === null || f.dueTime === undefined || f.dueTime === "") out.dueTime = null;
    else {
      const t = parseTime(f.dueTime);
      if (!t.ok) return t;
      out.dueTime = t.value;
    }
  }
  if ("status" in f && f.status !== undefined) {
    if (!STATUSES.includes(f.status as TaskStatus)) return { ok: false, error: "Status inválido" };
    out.status = f.status as TaskStatus;
  }
  return { ok: true, value: out };
}

function parseList(raw: unknown, max: number, maxLen: number, what: string): { ok: true; value: string[] } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw) || raw.length > max) return { ok: false, error: `Lista de ${what} inválida` };
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return { ok: false, error: `Lista de ${what} inválida` };
    const v = maxLen <= 200 ? validateLabel(item, maxLen, "um texto") : cleanNotes(item, maxLen);
    if (!v.ok || !v.value) return { ok: false, error: `Preencha os ${what} (até ${maxLen} caracteres)` };
    out.push(v.value);
  }
  return { ok: true, value: out };
}

// ---------- tarefas ----------

export async function createTaskAction(raw: Record<string, unknown>): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  const fields = parseTaskFields(raw, true);
  if (!fields.ok) return fields;
  const checklist = parseList(raw?.checklist, store.LIMITS.items, 200, "itens do checklist");
  if (!checklist.ok) return checklist;
  const notes = parseList(raw?.notes, store.LIMITS.notes, 1000, "notas");
  if (!notes.ok) return notes;
  const r = store.createTask(getDb(), s.userId, {
    ...fields.value,
    title: fields.value.title!,
    checklist: checklist.value,
    notes: notes.value,
  });
  return done(r.ok ? { ok: true } : r);
}

export async function updateTaskAction(id: number, raw: object): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  if (!isId(id)) return nf("Tarefa");
  const fields = parseTaskFields(raw, false);
  if (!fields.ok) return fields;
  return done(store.updateTask(getDb(), s.userId, id, fields.value));
}

export async function setTaskDoneAction(id: number, value: boolean): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  if (!isId(id) || typeof value !== "boolean") return nf("Tarefa");
  return done(store.setTaskDone(getDb(), s.userId, id, value));
}

export async function deleteTaskAction(id: number): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  if (!isId(id)) return nf("Tarefa");
  return done(store.deleteTask(getDb(), s.userId, id));
}

// ---------- checklist e notas da tarefa ----------

function shortText(raw: unknown, max: number) {
  return typeof raw === "string" ? validateLabel(raw, max, "um texto") : ({ ok: false, error: "Texto inválido" } as const);
}

export async function addItemAction(taskId: number, text: string): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  if (!isId(taskId)) return nf("Tarefa");
  const t = shortText(text, 200);
  if (!t.ok) return t;
  return done(store.addItem(getDb(), s.userId, taskId, t.value));
}

export async function updateItemAction(itemId: number, text: string): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  if (!isId(itemId)) return nf("Item");
  const t = shortText(text, 200);
  if (!t.ok) return t;
  return done(store.updateItem(getDb(), s.userId, itemId, t.value));
}

export async function toggleItemAction(itemId: number, value: boolean): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  if (!isId(itemId) || typeof value !== "boolean") return nf("Item");
  return done(store.toggleItem(getDb(), s.userId, itemId, value));
}

export async function deleteItemAction(itemId: number): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  if (!isId(itemId)) return nf("Item");
  return done(store.deleteItem(getDb(), s.userId, itemId));
}

export async function moveItemAction(itemId: number, dir: -1 | 1): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  if (!isId(itemId) || (dir !== -1 && dir !== 1)) return nf("Item");
  return done(store.moveItem(getDb(), s.userId, itemId, dir));
}

function noteText(raw: unknown) {
  if (typeof raw !== "string") return { ok: false as const, error: "Texto inválido" };
  const n = cleanNotes(raw, 1000);
  if (!n.ok) return n;
  return n.value ? n : { ok: false as const, error: "Escreva a nota" };
}

export async function addNoteAction(taskId: number, text: string): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  if (!isId(taskId)) return nf("Tarefa");
  const t = noteText(text);
  if (!t.ok) return t;
  return done(store.addNote(getDb(), s.userId, taskId, t.value));
}

export async function updateNoteAction(noteId: number, text: string): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  if (!isId(noteId)) return nf("Nota");
  const t = noteText(text);
  if (!t.ok) return t;
  return done(store.updateNote(getDb(), s.userId, noteId, t.value));
}

export async function deleteNoteAction(noteId: number): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  if (!isId(noteId)) return nf("Nota");
  return done(store.deleteNote(getDb(), s.userId, noteId));
}

// ---------- grupos ----------

function parseGroup(name: unknown, kind: unknown): { ok: true; value: { name: string; kind: store.GroupKind } } | { ok: false; error: string } {
  if (kind !== "category" && kind !== "project") return { ok: false, error: "Tipo inválido" };
  const n = shortText(name, 40);
  if (!n.ok) return n;
  return { ok: true, value: { name: n.value, kind } };
}

export async function createGroupAction(name: string, kind: store.GroupKind): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  const g = parseGroup(name, kind);
  if (!g.ok) return g;
  return done(store.createGroup(getDb(), s.userId, g.value));
}

export async function updateGroupAction(id: number, name: string, kind: store.GroupKind): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  if (!isId(id)) return nf("Grupo");
  const g = parseGroup(name, kind);
  if (!g.ok) return g;
  return done(store.updateGroup(getDb(), s.userId, id, g.value));
}

export async function deleteGroupAction(id: number, destId: number | null): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  if (!isId(id) || !(destId === null || isId(destId))) return nf("Grupo");
  return done(store.deleteGroup(getDb(), s.userId, id, destId));
}

// ---------- compromissos ----------

function parseEvent(raw: unknown): { ok: true; value: store.EventInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Dados inválidos" };
  const e = raw as Record<string, unknown>;
  const title = shortText(e.title, 120);
  if (!title.ok) return title;
  const date = parseDate(e.date);
  if (!date.ok) return date;
  let time: string | null = null;
  if (e.time !== null && e.time !== undefined && e.time !== "") {
    const t = parseTime(e.time);
    if (!t.ok) return t;
    time = t.value;
  }
  if (!optionalId(e.categoryId)) return { ok: false, error: "Categoria inválida" };
  if (typeof (e.description ?? "") !== "string") return { ok: false, error: "Descrição inválida" };
  const description = cleanNotes(String(e.description ?? ""), 2000);
  if (!description.ok) return description;
  if (!EVENT_STATUSES.includes(e.status as (typeof EVENT_STATUSES)[number])) return { ok: false, error: "Status inválido" };
  return {
    ok: true,
    value: {
      title: title.value,
      date: date.value,
      time,
      categoryId: (e.categoryId as number | null | undefined) ?? null,
      description: description.value,
      status: e.status as (typeof EVENT_STATUSES)[number],
    },
  };
}

export async function createEventAction(raw: Record<string, unknown>): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  const e = parseEvent(raw);
  if (!e.ok) return e;
  return done(store.createEvent(getDb(), s.userId, e.value));
}

export async function updateEventAction(id: number, raw: Record<string, unknown>): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  if (!isId(id)) return nf("Compromisso");
  const e = parseEvent(raw);
  if (!e.ok) return e;
  return done(store.updateEvent(getDb(), s.userId, id, e.value));
}

export async function deleteEventAction(id: number): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  if (!isId(id)) return nf("Compromisso");
  return done(store.deleteEvent(getDb(), s.userId, id));
}

// ---------- notas rápidas ----------

export async function createQuickNoteAction(text: string): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  const t = noteText(text);
  if (!t.ok) return t;
  return done(store.createQuickNote(getDb(), s.userId, t.value));
}

export async function updateQuickNoteAction(id: number, text: string): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  if (!isId(id)) return nf("Nota");
  const t = noteText(text);
  if (!t.ok) return t;
  return done(store.updateQuickNote(getDb(), s.userId, id, t.value));
}

export async function pinQuickNoteAction(id: number, pinned: boolean): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  if (!isId(id) || typeof pinned !== "boolean") return nf("Nota");
  return done(store.setQuickNotePinned(getDb(), s.userId, id, pinned));
}

export async function deleteQuickNoteAction(id: number): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  if (!isId(id)) return nf("Nota");
  return done(store.deleteQuickNote(getDb(), s.userId, id));
}

export async function convertQuickNoteAction(id: number): Promise<Result> {
  const s = await begin();
  if ("error" in s) return s.error;
  if (!isId(id)) return nf("Nota");
  return done(store.convertQuickNote(getDb(), s.userId, id));
}
