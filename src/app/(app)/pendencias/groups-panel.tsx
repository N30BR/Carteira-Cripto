"use client";

import { useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TaskView } from "@/lib/todos/logic";
import type { Group, GroupKind } from "@/lib/todos/store";
import { cn } from "@/lib/utils";
import { createGroupAction, deleteGroupAction, updateGroupAction } from "./actions";
import { GroupIcon, selectClass, useRun } from "./ui";
import type { Scope } from "./view";

const KIND_LABEL: Record<GroupKind, string> = { category: "Categoria", project: "Projeto" };

/** Painel de categorias e projetos: contagem de tarefas abertas, filtro, criar, editar e excluir. */
export function GroupsPanel({ groups, tasks, scope, onScope }: { groups: Group[]; tasks: TaskView[]; scope: Scope; onScope: (s: Scope) => void }) {
  const [editing, setEditing] = useState<Group | "new" | null>(null);
  const open = (id: number) => tasks.filter((t) => t.status !== "done" && (t.categoryId === id || t.projectId === id)).length;

  const section = (kind: GroupKind, title: string) => {
    const list = groups.filter((g) => g.kind === kind);
    if (!list.length) return null;
    return (
      <div className="flex flex-col gap-1">
        <span className="px-2 text-xs tracking-wide text-muted-foreground uppercase">{title}</span>
        {list.map((g) => {
          const active = scope.kind === "group" && scope.id === g.id;
          return (
            <div key={g.id} className={cn("group flex items-center gap-1 rounded-lg", active && "bg-muted")}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onScope(active ? { kind: "all" } : { kind: "group", id: g.id })}
                className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted/60", active && "font-semibold")}
              >
                <GroupIcon group={g} />
                <span className="truncate">{g.name}</span>
                <span className="ml-auto rounded-md bg-muted px-1.5 text-xs tabular-nums">{open(g.id)}</span>
              </button>
              <Button variant="ghost" size="icon-sm" aria-label={`Editar ${g.name}`} onClick={() => setEditing(g)}>
                <MoreHorizontal />
              </Button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Categorias / Projetos</CardTitle>
        <Button variant="outline" size="icon-sm" aria-label="Nova categoria ou projeto" onClick={() => setEditing("new")}>
          <Plus />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {groups.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma categoria. Clique em + para criar.</p>}
        {section("category", "Categorias")}
        {section("project", "Projetos")}
      </CardContent>
      {editing && <GroupDialog group={editing === "new" ? null : editing} groups={groups} hasTasks={editing !== "new" && open(editing.id) + tasks.filter((t) => t.status === "done" && (t.categoryId === editing.id || t.projectId === editing.id)).length > 0} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function GroupDialog({ group, groups, hasTasks, onClose }: { group: Group | null; groups: Group[]; hasTasks: boolean; onClose: () => void }) {
  const [name, setName] = useState(group?.name ?? "");
  const [kind, setKind] = useState<GroupKind>(group?.kind ?? "category");
  const [dest, setDest] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { pending, run } = useRun();
  const destinations = group ? groups.filter((g) => g.kind === group.kind && g.id !== group.id) : [];

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{group ? `Editar "${group.name}"` : "Nova categoria ou projeto"}</DialogTitle>
          <DialogDescription>Categorias classificam (Profissional, Casa…); projetos agrupam tarefas de um objetivo (Mestrado…).</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => (group ? updateGroupAction(group.id, name, kind) : createGroupAction(name, kind)), group ? "Salvo" : "Criado", onClose);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-name">Nome</Label>
            <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-kind">Tipo</Label>
            <select id="group-kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as GroupKind)}>
              <option value="category">{KIND_LABEL.category}</option>
              <option value="project">{KIND_LABEL.project}</option>
            </select>
          </div>
          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            {group && (
              <Button type="button" variant="destructive" onClick={() => setConfirmDelete((v) => !v)}>
                Excluir
              </Button>
            )}
            <Button type="submit" disabled={pending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
        {group && confirmDelete && (
          <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3 text-sm">
            {hasTasks ? (
              <>
                <Label htmlFor="group-dest">Para onde vão as tarefas de &quot;{group.name}&quot;?</Label>
                <select id="group-dest" className={selectClass} value={dest} onChange={(e) => setDest(e.target.value)}>
                  <option value="">Ficar sem {group.kind === "category" ? "categoria" : "projeto"}</option>
                  {destinations.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <p>Nenhuma tarefa usa este grupo.</p>
            )}
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => deleteGroupAction(group.id, dest ? Number(dest) : null), "Excluído", onClose)}
            >
              Confirmar exclusão
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
