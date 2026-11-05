// Regras das pendências (funções puras, sem banco).

export type TaskStatus = "pending" | "in_progress" | "done";
export type ChecklistItem = { id: number; text: string; done: boolean; position: number };
export type TaskNote = { id: number; text: string };

export type TaskView = {
  id: number;
  title: string;
  description: string;
  categoryId: number | null;
  projectId: number | null;
  priority: 1 | 2 | 3;
  dueDate: string | null;
  dueTime: string | null;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  checklist: ChecklistItem[];
  notes: TaskNote[];
};

export type EventView = { id: number; title: string; date: string; time: string | null; status: "scheduled" | "done" | "canceled" };

/** Percentual (0–100): pelo checklist, ou 0/100 pelo status quando não há checklist. */
export function progress(t: Pick<TaskView, "checklist" | "status">): number {
  if (!t.checklist.length) return t.status === "done" ? 100 : 0;
  return Math.round((t.checklist.filter((i) => i.done).length / t.checklist.length) * 100);
}

/** Status depois de uma mudança no checklist: todos feitos = concluída, parte = em andamento. */
export function statusAfterChecklist(prev: TaskStatus, items: Pick<ChecklistItem, "done">[]): TaskStatus {
  if (!items.length) return prev;
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return "done";
  if (done > 0) return "in_progress";
  return prev === "in_progress" ? "in_progress" : "pending";
}

export type IndicatorKey = "overdue" | "today" | "inProgress" | "done" | "high";

export function matchesIndicator(t: TaskView, key: IndicatorKey, today: string): boolean {
  const open = t.status !== "done";
  switch (key) {
    case "overdue":
      return open && t.dueDate !== null && t.dueDate < today;
    case "today":
      return open && t.dueDate === today;
    case "inProgress":
      return t.status === "in_progress";
    case "done":
      return t.status === "done";
    case "high":
      return open && t.priority === 3;
  }
}

export function indicators(tasks: TaskView[], today: string): Record<IndicatorKey, number> {
  const keys: IndicatorKey[] = ["overdue", "today", "inProgress", "done", "high"];
  return Object.fromEntries(keys.map((k) => [k, tasks.filter((t) => matchesIndicator(t, k, today)).length])) as Record<
    IndicatorKey,
    number
  >;
}

/** Minúsculas e sem acentos, para a busca. */
export function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function matchesSearch(t: TaskView, query: string): boolean {
  const q = normalize(query.trim());
  if (!q) return true;
  const haystack = [t.title, t.description, ...t.notes.map((n) => n.text), ...t.checklist.map((i) => i.text)];
  return haystack.some((s) => normalize(s).includes(q));
}

export type SortKey = "priority" | "due" | "created" | "updated" | "progress";

const byDue = (a: TaskView, b: TaskView) => {
  if (a.dueDate === b.dueDate) return 0;
  if (a.dueDate === null) return 1; // sem prazo por último
  if (b.dueDate === null) return -1;
  return a.dueDate < b.dueDate ? -1 : 1;
};

/** Concluídas sempre no fim; dentro de cada grupo, pela ordenação escolhida. */
export function sortTasks(tasks: TaskView[], key: SortKey): TaskView[] {
  const cmp: Record<SortKey, (a: TaskView, b: TaskView) => number> = {
    priority: (a, b) => b.priority - a.priority || byDue(a, b),
    due: (a, b) => byDue(a, b) || b.priority - a.priority,
    created: (a, b) => b.createdAt - a.createdAt,
    updated: (a, b) => b.updatedAt - a.updatedAt,
    progress: (a, b) => progress(b) - progress(a) || b.priority - a.priority,
  };
  return [...tasks].sort(
    (a, b) =>
      Number(a.status === "done") - Number(b.status === "done") || cmp[key](a, b) || a.title.localeCompare(b.title, "pt-BR"),
  );
}

export type UpcomingItem = { kind: "task" | "event"; id: number; title: string; date: string; time: string | null; overdue: boolean };

/** Tarefas abertas com prazo e compromissos agendados: atrasadas primeiro, depois por data. */
export function upcoming(tasks: TaskView[], events: EventView[], today: string, limit: number): UpcomingItem[] {
  const list: UpcomingItem[] = [
    ...tasks
      .filter((t) => t.status !== "done" && t.dueDate)
      .map((t) => ({ kind: "task" as const, id: t.id, title: t.title, date: t.dueDate!, time: t.dueTime, overdue: t.dueDate! < today })),
    ...events
      .filter((e) => e.status === "scheduled" && e.date >= today)
      .map((e) => ({ kind: "event" as const, id: e.id, title: e.title, date: e.date, time: e.time, overdue: false })),
  ];
  return list
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""))
    .slice(0, limit);
}

/** Semanas (segunda a domingo) que cobrem o mês "AAAA-MM". */
export function calendarWeeks(month: string): { date: string; inMonth: boolean }[][] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // segunda = 0
  const start = new Date(Date.UTC(y, m - 1, 1 - offset));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weeks = Math.ceil((offset + days) / 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(start.getTime() + (w * 7 + d) * 86_400_000).toISOString().slice(0, 10);
      return { date, inMonth: date.slice(0, 7) === month };
    }),
  );
}
