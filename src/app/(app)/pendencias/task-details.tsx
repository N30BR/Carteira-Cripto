"use client";

import { useOptimistic, useState } from "react";
import { ArrowDown, ArrowUp, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { progress, type TaskStatus, type TaskView } from "@/lib/todos/logic";
import type { Group } from "@/lib/todos/store";
import { cn } from "@/lib/utils";
import {
  addItemAction,
  addNoteAction,
  deleteItemAction,
  deleteNoteAction,
  deleteTaskAction,
  moveItemAction,
  setTaskDoneAction,
  toggleItemAction,
  updateItemAction,
  updateNoteAction,
  updateTaskAction,
} from "./actions";
import { ProgressBar, Stars, formatDay, selectClass, useRun } from "./ui";

const STATUS_LABEL: Record<TaskStatus, string> = { pending: "Pendente", in_progress: "Em andamento", done: "Concluída" };
const textareaClass =
  "min-h-20 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30";

/** Texto que vira campo de edição ao clicar no lápis; salva ao confirmar. */
function EditableText({ value, onSave, label, multiline }: { value: string; onSave: (v: string) => void; label: string; multiline?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return (
      <span className="group inline-flex min-w-0 items-start gap-1">
        <span className="min-w-0 break-words whitespace-pre-wrap">{value}</span>
        <button type="button" aria-label={`Editar ${label}`} className="text-muted-foreground opacity-60 hover:opacity-100" onClick={() => { setDraft(value); setEditing(true); }}>
          <Pencil className="size-3.5" />
        </button>
      </span>
    );
  }
  const save = () => {
    setEditing(false);
    if (draft.trim() && draft !== value) onSave(draft);
  };
  return multiline ? (
    <textarea aria-label={label} autoFocus className={textareaClass} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save} />
  ) : (
    <Input
      aria-label={label}
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

export function TaskDetails({ task, groups, today }: { task: TaskView | null; groups: Group[]; today: string }) {
  const { pending, run } = useRun();
  // Marcação do checklist aparece na hora; o servidor confirma (ou desfaz) em seguida.
  const [items, setItemDone] = useOptimistic(task?.checklist ?? [], (state, change: { id: number; done: boolean }) =>
    state.map((i) => (i.id === change.id ? { ...i, done: change.done } : i)),
  );
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueDraft, setDueDraft] = useState(task?.dueDate ?? "");
  const [newItem, setNewItem] = useState("");
  const [newNote, setNewNote] = useState("");

  if (!task) {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Detalhes da tarefa</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Selecione uma tarefa na lista ou crie uma nova.</CardContent>
      </Card>
    );
  }

  const pct = progress({ checklist: items, status: task.status });
  const doneCount = items.filter((i) => i.done).length;
  const overdue = task.status !== "done" && task.dueDate !== null && task.dueDate < today;
  const update = (patch: Record<string, unknown>, msg?: string) => run(() => updateTaskAction(task.id, patch), msg);

  return (
    <Card className="min-w-0" aria-label="Detalhes da tarefa">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Detalhes da tarefa</CardTitle>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Mais opções">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => run(() => setTaskDoneAction(task.id, task.status !== "done"))}>
              {task.status === "done" ? "Reabrir tarefa" : "Concluir tarefa"}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => {
                if (confirm(`Excluir "${task.title}" com o checklist e as notas?`)) run(() => deleteTaskAction(task.id), "Tarefa excluída");
              }}
            >
              Excluir tarefa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div className="text-lg font-semibold" data-testid="detail-title">
          <EditableText label="título" value={task.title} onSave={(v) => update({ title: v })} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="d-cat">Categoria</Label>
            <select id="d-cat" className={selectClass} value={task.categoryId ?? ""} onChange={(e) => update({ categoryId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Sem categoria</option>
              {groups.filter((g) => g.kind === "category").map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="d-proj">Projeto</Label>
            <select id="d-proj" className={selectClass} value={task.projectId ?? ""} onChange={(e) => update({ projectId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Sem projeto</option>
              {groups.filter((g) => g.kind === "project").map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Prioridade</span>
            <Stars size="md" value={task.priority} onChange={(v) => update({ priority: v })} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="d-status">Status</Label>
            <select id="d-status" className={selectClass} value={task.status} onChange={(e) => update({ status: e.target.value })}>
              {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="d-due">Prazo</Label>
            <Input
              id="d-due"
              type="date"
              min="2000-01-01"
              max="2099-12-31"
              className="[color-scheme:dark]"
              value={dueDraft}
              onChange={(e) => setDueDraft(e.target.value)}
              onBlur={() => {
                const v = dueDraft || null;
                if (v === task.dueDate) return;
                if (v && v.slice(0, 4) < "2000") return setDueDraft(task.dueDate ?? "");
                update({ dueDate: v });
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="d-time">Horário</Label>
            <Input
              id="d-time"
              type="time"
              className="[color-scheme:dark]"
              defaultValue={task.dueTime ?? ""}
              onBlur={(e) => (e.target.value || null) !== task.dueTime && update({ dueTime: e.target.value || null })}
            />
          </div>
        </div>
        {task.dueDate && (
          <p className={cn("text-sm", overdue ? "text-destructive" : "text-muted-foreground")}>
            Prazo: {formatDay(task.dueDate)}
            {task.dueTime ? ` às ${task.dueTime}` : ""}
            {overdue ? " (atrasada)" : task.dueDate === today ? " (hoje)" : ""}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="d-desc">Descrição / Notas</Label>
          <textarea
            id="d-desc"
            className={textareaClass}
            value={description}
            maxLength={5000}
            placeholder="Detalhes da tarefa"
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== task.description && update({ description }, "Descrição salva")}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              Micro checklist ({doneCount} de {task.checklist.length})
            </span>
            <span className="tabular-nums text-muted-foreground" data-testid="detail-progress">
              {pct}%
            </span>
          </div>
          <ProgressBar value={pct} />
          <ul className="flex flex-col gap-1">
            {items.map((i, idx) => (
              <li key={i.id} className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted/40">
                <input
                  type="checkbox"
                  aria-label={`Marcar ${i.text}`}
                  className="size-4 accent-primary"
                  checked={i.done}
                  disabled={pending}
                  onChange={(e) => {
                    const done = e.target.checked;
                    run(() => toggleItemAction(i.id, done), undefined, undefined, () => setItemDone({ id: i.id, done }));
                  }}
                />
                <span className={cn("min-w-0 flex-1", i.done && "text-muted-foreground line-through")}>
                  <EditableText label={`item ${i.text}`} value={i.text} onSave={(v) => run(() => updateItemAction(i.id, v))} />
                </span>
                <Button variant="ghost" size="icon-xs" aria-label={`Subir ${i.text}`} disabled={idx === 0} onClick={() => run(() => moveItemAction(i.id, -1))}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon-xs" aria-label={`Descer ${i.text}`} disabled={idx === items.length - 1} onClick={() => run(() => moveItemAction(i.id, 1))}>
                  <ArrowDown />
                </Button>
                <Button variant="ghost" size="icon-xs" className="text-destructive" aria-label={`Excluir ${i.text}`} onClick={() => run(() => deleteItemAction(i.id))}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => addItemAction(task.id, newItem), undefined, () => setNewItem(""));
            }}
          >
            <Input aria-label="Novo item do checklist" placeholder="Novo item" value={newItem} onChange={(e) => setNewItem(e.target.value)} maxLength={200} />
            <Button type="submit" variant="outline" size="icon" aria-label="Adicionar item" disabled={pending}>
              <Plus />
            </Button>
          </form>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-medium">Notas adicionais</span>
          {task.notes.length === 0 && <span className="text-muted-foreground">Nenhuma nota.</span>}
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {task.notes.map((n) => (
              <li key={n.id}>
                <span className="flex items-start gap-1">
                  <span className="min-w-0 flex-1">
                    <EditableText label="nota" multiline value={n.text} onSave={(v) => run(() => updateNoteAction(n.id, v))} />
                  </span>
                  <button type="button" aria-label="Excluir nota" className="text-destructive opacity-60 hover:opacity-100" onClick={() => run(() => deleteNoteAction(n.id))}>
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => addNoteAction(task.id, newNote), undefined, () => setNewNote(""));
            }}
          >
            <Input aria-label="Nova nota" placeholder="Nova nota" value={newNote} onChange={(e) => setNewNote(e.target.value)} maxLength={1000} />
            <Button type="submit" variant="outline" size="icon" aria-label="Adicionar nota" disabled={pending}>
              <Plus />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
