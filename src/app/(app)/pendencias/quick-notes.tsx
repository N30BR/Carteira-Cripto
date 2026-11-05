"use client";

import { useState } from "react";
import { ListTodo, Pencil, Pin, PinOff, Plus, StickyNote, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { QuickNote } from "@/lib/todos/store";
import { cn } from "@/lib/utils";
import { convertQuickNoteAction, createQuickNoteAction, deleteQuickNoteAction, pinQuickNoteAction, updateQuickNoteAction } from "./actions";
import { useRun } from "./ui";

/** Notas rápidas independentes: criar, editar, fixar, excluir e virar tarefa. */
export function QuickNotesPanel({ notes }: { notes: QuickNote[] }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const { pending, run } = useRun();

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <StickyNote className="size-5" /> Notas rápidas
        </CardTitle>
        <Button variant="outline" size="icon-sm" aria-label="Nova nota rápida" onClick={() => setAdding((v) => !v)}>
          <Plus />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {adding && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => createQuickNoteAction(text), undefined, () => {
                setText("");
                setAdding(false);
              });
            }}
          >
            <Input autoFocus aria-label="Texto da nota rápida" placeholder="Escreva a nota" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
            <Button type="submit" disabled={pending}>
              Salvar
            </Button>
          </form>
        )}
        {notes.length === 0 && !adding && <p className="text-sm text-muted-foreground">Nenhuma nota. Clique em + para anotar algo rápido.</p>}
        <ul className="flex flex-col divide-y" aria-label="Notas rápidas">
          {notes.map((n) => (
            <li key={n.id} className="group flex items-start gap-2 py-2 text-sm">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.pinned ? "bg-primary" : "bg-muted-foreground/60")} />
              {editingId === n.id ? (
                <form
                  className="flex min-w-0 flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => updateQuickNoteAction(n.id, draft), undefined, () => setEditingId(null));
                  }}
                >
                  <Input autoFocus aria-label="Editar nota" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} />
                  <Button type="submit" size="sm" disabled={pending}>
                    Salvar
                  </Button>
                </form>
              ) : (
                <span className="min-w-0 flex-1 break-words whitespace-pre-wrap">{n.text}</span>
              )}
              {editingId !== n.id && (
                <span className="flex shrink-0 items-center">
                  <Button variant="ghost" size="icon-xs" aria-label={n.pinned ? "Desafixar nota" : "Fixar nota"} onClick={() => run(() => pinQuickNoteAction(n.id, !n.pinned))}>
                    {n.pinned ? <PinOff /> : <Pin />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Editar nota"
                    onClick={() => {
                      setDraft(n.text);
                      setEditingId(n.id);
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-xs" aria-label="Virar tarefa" title="Virar tarefa" onClick={() => run(() => convertQuickNoteAction(n.id), "Nota virou tarefa")}>
                    <ListTodo />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-destructive"
                    aria-label="Excluir nota"
                    onClick={() => confirm("Excluir esta nota?") && run(() => deleteQuickNoteAction(n.id), "Nota excluída")}
                  >
                    <Trash2 />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
