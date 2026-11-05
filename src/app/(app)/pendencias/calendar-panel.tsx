"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addMonths } from "@/lib/cards/months";
import { calendarWeeks, upcoming, type EventView, type TaskView } from "@/lib/todos/logic";
import type { Group } from "@/lib/todos/store";
import { cn } from "@/lib/utils";
import { createEventAction, deleteEventAction, updateEventAction } from "./actions";
import { formatDay, selectClass, useRun } from "./ui";

type EventFull = EventView & { categoryId: number | null; description: string };

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const EVENT_STATUS = { scheduled: "Agendado", done: "Realizado", canceled: "Cancelado" } as const;

export function CalendarPanel({
  today,
  tasks,
  events,
  categories,
  onSelectTask,
}: {
  today: string;
  tasks: TaskView[];
  events: EventFull[];
  categories: Group[];
  onSelectTask: (id: number) => void;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [day, setDay] = useState<string | null>(null);
  const [editing, setEditing] = useState<EventFull | "new" | null>(null);
  const { run } = useRun();

  const openTasksOn = (d: string) => tasks.filter((t) => t.status !== "done" && t.dueDate === d);
  const eventsOn = (d: string) => events.filter((e) => e.date === d && e.status !== "canceled");
  const next = upcoming(tasks, events, today, 8);
  const [y, m] = month.split("-").map(Number);

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-5" /> Prazos e compromissos
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
          <Plus /> Compromisso
        </Button>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon-sm" aria-label="Mês anterior" onClick={() => setMonth(addMonths(month, -1))}>
              <ChevronLeft />
            </Button>
            <span className="font-semibold">
              {MONTHS[m - 1]} {y}
            </span>
            <Button variant="ghost" size="icon-sm" aria-label="Próximo mês" onClick={() => setMonth(addMonths(month, 1))}>
              <ChevronRight />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs" role="grid" aria-label={`Calendário de ${MONTHS[m - 1]} de ${y}`}>
            {WEEKDAYS.map((w) => (
              <span key={w} className="py-1 text-muted-foreground">
                {w}
              </span>
            ))}
            {calendarWeeks(month).flat().map(({ date, inMonth }) => {
              const tasksHere = openTasksOn(date);
              const has = tasksHere.length > 0 || eventsOn(date).length > 0;
              const late = tasksHere.some(() => date < today);
              return (
                <button
                  key={date}
                  type="button"
                  aria-label={`${formatDay(date)}${has ? ", com itens" : ""}`}
                  aria-pressed={day === date}
                  onClick={() => setDay((d) => (d === date ? null : date))}
                  className={cn(
                    "relative flex aspect-square flex-col items-center justify-center rounded-md text-sm hover:bg-muted",
                    !inMonth && "text-muted-foreground/40",
                    inMonth && date < today && "text-muted-foreground",
                    date === today && "bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
                    day === date && date !== today && "ring-2 ring-primary",
                  )}
                >
                  {Number(date.slice(8))}
                  {has && <span className={cn("absolute bottom-1 size-1 rounded-full", late ? "bg-destructive" : date === today ? "bg-primary-foreground" : "bg-primary")} />}
                </button>
              );
            })}
          </div>
          {day && (
            <div className="flex flex-col gap-1 rounded-lg border p-2 text-sm">
              <span className="font-medium">{formatDay(day)}</span>
              {openTasksOn(day).length === 0 && eventsOn(day).length === 0 && <span className="text-muted-foreground">Nada neste dia.</span>}
              {openTasksOn(day).map((t) => (
                <button key={`t${t.id}`} type="button" className="text-left hover:underline" onClick={() => onSelectTask(t.id)}>
                  • {t.title}
                </button>
              ))}
              {eventsOn(day).map((e) => (
                <EventLine key={`e${e.id}`} event={e} onEdit={() => setEditing(e)} onDelete={() => confirm(`Excluir "${e.title}"?`) && run(() => deleteEventAction(e.id), "Compromisso excluído")} />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-6">
          <span className="font-medium">Próximos prazos</span>
          {next.length === 0 && <span className="text-sm text-muted-foreground">Nenhum prazo ou compromisso pela frente.</span>}
          <ul className="flex flex-col gap-1.5 text-sm" aria-label="Próximos prazos">
            {next.map((x) => (
              <li key={`${x.kind}${x.id}`}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 text-left hover:underline"
                  onClick={() => (x.kind === "task" ? onSelectTask(x.id) : setEditing(events.find((e) => e.id === x.id) ?? null))}
                >
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", x.overdue ? "bg-destructive" : x.kind === "event" ? "bg-emerald-500" : "bg-primary")} />
                  <span>
                    <span className={cn("font-medium", x.overdue && "text-destructive")}>{formatDay(x.date, false)}</span>
                    {x.time ? ` ${x.time}` : ""} – {x.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
      {editing && <EventDialog event={editing === "new" ? null : editing} defaultDate={day ?? today} categories={categories} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function EventLine({ event, onEdit, onDelete }: { event: EventFull; onEdit: () => void; onDelete: () => void }) {
  return (
    <span className="flex items-center gap-1">
      <span className="min-w-0 flex-1">
        • {event.time ? `${event.time} ` : ""}
        {event.title} <span className="text-xs text-muted-foreground">({EVENT_STATUS[event.status]})</span>
      </span>
      <Button variant="ghost" size="icon-xs" aria-label={`Editar ${event.title}`} onClick={onEdit}>
        <Pencil />
      </Button>
      <Button variant="ghost" size="icon-xs" className="text-destructive" aria-label={`Excluir ${event.title}`} onClick={onDelete}>
        <Trash2 />
      </Button>
    </span>
  );
}

function EventDialog({ event, defaultDate, categories, onClose }: { event: EventFull | null; defaultDate: string; categories: Group[]; onClose: () => void }) {
  const [f, setF] = useState({
    title: event?.title ?? "",
    date: event?.date ?? defaultDate,
    time: event?.time ?? "",
    categoryId: event?.categoryId ? String(event.categoryId) : "",
    description: event?.description ?? "",
    status: event?.status ?? "scheduled",
  });
  const { pending, run } = useRun();
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event ? "Editar compromisso" : "Novo compromisso"}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const data = { ...f, time: f.time || null, categoryId: f.categoryId ? Number(f.categoryId) : null };
            run(() => (event ? updateEventAction(event.id, data) : createEventAction(data)), "Compromisso salvo", onClose);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ev-title">Título</Label>
            <Input id="ev-title" value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={120} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ev-date">Data</Label>
              <Input id="ev-date" type="date" className="[color-scheme:dark]" value={f.date} onChange={(e) => set("date", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ev-time">Horário</Label>
              <Input id="ev-time" type="time" className="[color-scheme:dark]" value={f.time} onChange={(e) => set("time", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ev-cat">Categoria</Label>
              <select id="ev-cat" className={selectClass} value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ev-status">Status</Label>
              <select id="ev-status" className={selectClass} value={f.status} onChange={(e) => set("status", e.target.value)}>
                {Object.entries(EVENT_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ev-desc">Descrição</Label>
            <Input id="ev-desc" value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
