import { describe, expect, test } from "vitest";
import {
  calendarWeeks,
  indicators,
  matchesIndicator,
  matchesSearch,
  progress,
  sortTasks,
  statusAfterChecklist,
  upcoming,
  type TaskView,
} from "@/lib/todos/logic";

const today = "2026-11-05";
let n = 0;
const task = (o: Partial<TaskView> = {}): TaskView => ({
  id: ++n,
  title: `T${n}`,
  description: "",
  categoryId: null,
  projectId: null,
  priority: 2,
  dueDate: null,
  dueTime: null,
  status: "pending",
  createdAt: n,
  updatedAt: n,
  checklist: [],
  notes: [],
  ...o,
});
const items = (...done: boolean[]) => done.map((d, i) => ({ id: i + 1, text: `i${i}`, done: d, position: i }));

describe("progresso e status", () => {
  test("pelo checklist: 1 de 4 = 25%, 3 de 5 = 60%", () => {
    expect(progress(task({ checklist: items(true, false, false, false) }))).toBe(25);
    expect(progress(task({ checklist: items(true, true, true, false, false) }))).toBe(60);
  });
  test("sem checklist: 0 ou 100 pelo status", () => {
    expect(progress(task())).toBe(0);
    expect(progress(task({ status: "done" }))).toBe(100);
  });
  test("status acompanha o checklist", () => {
    expect(statusAfterChecklist("pending", items(true, false))).toBe("in_progress");
    expect(statusAfterChecklist("in_progress", items(true, true))).toBe("done");
    expect(statusAfterChecklist("done", items(false, false))).toBe("pending");
    expect(statusAfterChecklist("in_progress", items(false, false))).toBe("in_progress");
    expect(statusAfterChecklist("in_progress", [])).toBe("in_progress");
  });
});

describe("indicadores", () => {
  const ts = [
    task({ dueDate: "2026-11-03", priority: 3 }),
    task({ dueDate: "2026-11-05", status: "in_progress" }),
    task({ dueDate: "2026-11-01", status: "done", priority: 3 }),
    task({ dueDate: "2026-11-08" }),
  ];
  test("contagens", () => {
    expect(indicators(ts, today)).toEqual({ overdue: 1, today: 1, inProgress: 1, done: 1, high: 1 });
  });
  test("filtro por indicador", () => {
    expect(ts.filter((t) => matchesIndicator(t, "overdue", today)).map((t) => t.dueDate)).toEqual(["2026-11-03"]);
    expect(ts.filter((t) => matchesIndicator(t, "high", today))).toHaveLength(1);
  });
});

describe("ordenação", () => {
  test("padrão: mais estrelas primeiro, empate pelo prazo; concluídas no fim", () => {
    const ts = [
      task({ title: "feita3", priority: 3, status: "done" }),
      task({ title: "baixa", priority: 1, dueDate: "2026-11-01" }),
      task({ title: "alta-tarde", priority: 3, dueDate: "2026-12-01" }),
      task({ title: "alta-cedo", priority: 3, dueDate: "2026-11-02" }),
      task({ title: "media-sem-prazo", priority: 2 }),
    ];
    expect(sortTasks(ts, "priority").map((t) => t.title)).toEqual(["alta-cedo", "alta-tarde", "media-sem-prazo", "baixa", "feita3"]);
  });
  test("por prazo, concluídas continuam no fim", () => {
    const ts = [task({ title: "a", dueDate: "2026-11-01", status: "done" }), task({ title: "b", dueDate: "2026-12-01" }), task({ title: "c" })];
    expect(sortTasks(ts, "due").map((t) => t.title)).toEqual(["b", "c", "a"]);
  });
});

describe("busca", () => {
  test("título, descrição, notas e checklist, sem acento e sem diferenciar maiúsculas", () => {
    const t = task({ title: "Orçamento", description: "cliente X", checklist: [{ id: 1, text: "Revisar valores", done: false, position: 0 }], notes: [{ id: 1, text: "PDF do contrato" }] });
    expect(matchesSearch(t, "orcamento")).toBe(true);
    expect(matchesSearch(t, "CLIENTE")).toBe(true);
    expect(matchesSearch(t, "valores")).toBe(true);
    expect(matchesSearch(t, "contrato")).toBe(true);
    expect(matchesSearch(t, "viagem")).toBe(false);
  });
});

describe("próximos prazos e calendário", () => {
  test("atrasadas primeiro, depois por data; ignora concluídas e compromissos cancelados", () => {
    const ts = [task({ title: "atrasada", dueDate: "2026-11-03" }), task({ title: "depois", dueDate: "2026-11-10" }), task({ title: "feita", dueDate: "2026-11-04", status: "done" })];
    const ev = [
      { id: 1, title: "Reunião", date: "2026-11-08", time: "10:00", status: "scheduled" as const },
      { id: 2, title: "Cancelado", date: "2026-11-06", time: null, status: "canceled" as const },
    ];
    expect(upcoming(ts, ev, today, 8).map((x) => [x.title, x.overdue])).toEqual([
      ["atrasada", true],
      ["Reunião", false],
      ["depois", false],
    ]);
  });
  test("calendário de novembro/2026 começa na segunda 26/10 e tem semanas completas", () => {
    const w = calendarWeeks("2026-11");
    expect(w[0][0]).toEqual({ date: "2026-10-26", inMonth: false });
    expect(w[0][6]).toEqual({ date: "2026-11-01", inMonth: true });
    expect(w.every((week) => week.length === 7)).toBe(true);
    expect(w.at(-1)!.at(-1)!.date).toBe("2026-12-06");
  });
});
