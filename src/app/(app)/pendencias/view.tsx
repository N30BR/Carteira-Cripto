"use client";

import { useMemo, useOptimistic, useState } from "react";
import { AlarmClock, AlertTriangle, CalendarDays, CheckCircle2, Plus, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  indicators,
  matchesIndicator,
  matchesSearch,
  progress,
  sortTasks,
  type EventView,
  type IndicatorKey,
  type SortKey,
  type TaskView,
} from "@/lib/todos/logic";
import type { Group, QuickNote } from "@/lib/todos/store";
import { cn } from "@/lib/utils";
import { createTaskAction, setTaskDoneAction } from "./actions";
import { CalendarPanel } from "./calendar-panel";
import { GroupsPanel } from "./groups-panel";
import { QuickNotesPanel } from "./quick-notes";
import { TaskDetails } from "./task-details";
import { GroupIcon, ProgressBar, Stars, formatDay, selectClass, useRun } from "./ui";

export type Scope = { kind: "all" } | { kind: "projects" } | { kind: "group"; id: number };
type EventFull = EventView & { categoryId: number | null; description: string };

const INDICATORS: { key: IndicatorKey; label: string; icon: React.ReactNode }[] = [
  { key: "overdue", label: "Atrasadas", icon: <AlarmClock className="size-6 text-destructive" /> },
  { key: "today", label: "Hoje", icon: <CalendarDays className="size-6 text-primary" /> },
  { key: "inProgress", label: "Em andamento", icon: <RefreshCw className="size-6 text-primary" /> },
  { key: "done", label: "Concluídas", icon: <CheckCircle2 className="size-6 text-emerald-500" /> },
  { key: "high", label: "Alta prioridade", icon: <AlertTriangle className="size-6 text-destructive" /> },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "priority", label: "Prioridade" },
  { key: "due", label: "Prazo" },
  { key: "created", label: "Criação" },
  { key: "updated", label: "Atualização" },
  { key: "progress", label: "Progresso" },
];

export function TodosView({
  today,
  tasks: serverTasks,
  groups,
  events,
  quickNotes,
}: {
  today: string;
  tasks: TaskView[];
  groups: Group[];
  events: EventFull[];
  quickNotes: QuickNote[];
}) {
  const [indicator, setIndicator] = useState<IndicatorKey | null>(null);
  const [scope, setScope] = useState<Scope>({ kind: "all" });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("priority");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const { pending, run } = useRun();
  // Concluir/reabrir aparece na hora (a tarefa já desce para o fim); o servidor confirma em seguida.
  const [tasks, setTaskDone] = useOptimistic(serverTasks, (state, change: { id: number; done: boolean }) =>
    state.map((t) =>
      t.id === change.id
        ? {
            ...t,
            status: (change.done ? "done" : "pending") as TaskView["status"],
            checklist: t.checklist.map((i) => ({ ...i, done: change.done })),
          }
        : t,
    ),
  );

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const counts = indicators(tasks, today);
  const inScope = (t: TaskView) =>
    scope.kind === "all" ? true : scope.kind === "projects" ? t.projectId !== null : t.categoryId === scope.id || t.projectId === scope.id;
  const visible = sortTasks(
    tasks.filter((t) => inScope(t) && (!indicator || matchesIndicator(t, indicator, today)) && matchesSearch(t, search)),
    sort,
  );
  const selected = tasks.find((t) => t.id === selectedId) ?? visible[0] ?? null;
  const categories = groups.filter((g) => g.kind === "category");

  function addTask(e: React.FormEvent) {
    e.preventDefault();
    const scopeGroup = scope.kind === "group" ? groupById.get(scope.id) : undefined;
    run(
      () =>
        createTaskAction({
          title: newTitle,
          categoryId: scopeGroup?.kind === "category" ? scopeGroup.id : null,
          projectId: scopeGroup?.kind === "project" ? scopeGroup.id : null,
        }),
      "Tarefa criada",
      () => {
        setNewTitle("");
        setAdding(false);
      },
    );
  }

  const groupLabel = (t: TaskView) => {
    const g = (t.projectId !== null && groupById.get(t.projectId)) || (t.categoryId !== null && groupById.get(t.categoryId)) || null;
    return g ? (
      <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground">
        <GroupIcon group={g} className="size-3" /> {g.name}
      </span>
    ) : null;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {INDICATORS.map((i) => (
          <button
            key={i.key}
            type="button"
            aria-pressed={indicator === i.key}
            onClick={() => setIndicator((v) => (v === i.key ? null : i.key))}
            className={cn(
              "flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/50",
              indicator === i.key && "border-primary ring-2 ring-primary/30",
            )}
          >
            {i.icon}
            <span className="flex flex-col">
              <span className="text-sm text-muted-foreground">{i.label}</span>
              <span className="text-2xl font-semibold tabular-nums" data-testid={`ind-${i.key}`}>
                {counts[i.key]}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[{ kind: "all" as const, label: "Todas" }, ...categories.map((c) => ({ kind: "group" as const, id: c.id, label: c.name })), { kind: "projects" as const, label: "Projetos" }].map(
          (s) => {
            const active = s.kind === scope.kind && (s.kind !== "group" || (scope.kind === "group" && scope.id === s.id));
            return (
              <Button
                key={s.kind === "group" ? s.id : s.kind}
                variant={active ? "default" : "outline"}
                size="sm"
                onClick={() => setScope(s.kind === "group" ? { kind: "group", id: s.id } : { kind: s.kind })}
              >
                {s.kind === "group" && <GroupIcon group={groupById.get(s.id) ?? null} />}
                {s.label}
              </Button>
            );
          },
        )}
        {(indicator || scope.kind !== "all" || search) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIndicator(null);
              setScope({ kind: "all" });
              setSearch("");
            }}
          >
            Limpar filtros
          </Button>
        )}
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar tarefa, nota ou checklist"
            placeholder="Buscar tarefa, nota ou checklist..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(200px,22fr)_43fr_35fr]">
        <GroupsPanel groups={groups} tasks={tasks} scope={scope} onScope={setScope} />

        <Card className="min-w-0">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Tarefas ({visible.length})</CardTitle>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground" htmlFor="todo-sort">
                Ordenar por:
              </label>
              <select id="todo-sort" className={cn(selectClass, "h-8")} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={() => setAdding((v) => !v)}>
                <Plus /> Nova tarefa
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {adding && (
              <form onSubmit={addTask} className="flex gap-2">
                <Input autoFocus aria-label="Título da nova tarefa" placeholder="Título da tarefa" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={120} />
                <Button type="submit" disabled={pending}>
                  Criar
                </Button>
              </form>
            )}
            {visible.length === 0 && (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                {tasks.length === 0 ? "Nenhuma tarefa ainda. Clique em Nova tarefa para começar." : "Nenhuma tarefa com esses filtros."}
              </p>
            )}
            <ul className="flex flex-col gap-2" aria-label="Tarefas">
              {visible.map((t) => {
                const pct = progress(t);
                const isDone = t.status === "done";
                const overdue = !isDone && t.dueDate !== null && t.dueDate < today;
                const due = t.dueDate
                  ? isDone
                    ? `Prazo: ${formatDay(t.dueDate, false)}`
                    : overdue
                      ? `Atrasada: ${formatDay(t.dueDate, false)}`
                      : t.dueDate === today
                        ? `Hoje: ${formatDay(t.dueDate, false)}`
                        : `Vence: ${formatDay(t.dueDate, false)}`
                  : null;
                const shown = t.checklist.slice(0, 2);
                return (
                  <li
                    key={t.id}
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/40",
                      selected?.id === t.id && "border-primary ring-1 ring-primary/40",
                      isDone && "opacity-70",
                    )}
                    onClick={() => setSelectedId(t.id)}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Concluir ${t.title}`}
                      className="mt-1 size-4 shrink-0 accent-primary"
                      checked={isDone}
                      disabled={pending}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const done = e.target.checked;
                        run(() => setTaskDoneAction(t.id, done), undefined, undefined, () => setTaskDone({ id: t.id, done }));
                      }}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className={cn("font-medium break-words", isDone && "text-muted-foreground line-through")}>{t.title}</span>
                        <Stars value={t.priority} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {groupLabel(t)}
                        {due && <span className={cn(overdue ? "text-destructive" : "text-muted-foreground")}>{due}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <ProgressBar value={pct} />
                        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
                      </div>
                      {shown.length > 0 && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {shown.map((i) => (
                            <span key={i.id} className={cn("inline-flex items-center gap-1", i.done && "line-through")}>
                              <input type="checkbox" checked={i.done} readOnly tabIndex={-1} className="size-3 accent-primary" aria-hidden />
                              {i.text}
                            </span>
                          ))}
                          {t.checklist.length > 2 && <span>+{t.checklist.length - 2} {t.checklist.length - 2 === 1 ? "item" : "itens"}</span>}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <TaskDetails key={selected?.id ?? "none"} task={selected} groups={groups} today={today} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[55fr_45fr]">
        <CalendarPanel today={today} tasks={tasks} events={events} categories={categories} onSelectTask={setSelectedId} />
        <QuickNotesPanel notes={quickNotes} />
      </div>
    </div>
  );
}
