"use client";

import { useMemo, useState } from "react";
import { Keyboard, Search } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { searchShortcuts, type Shortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

type Item = Pick<Shortcut, "id" | "keys" | "action" | "description" | "when">;
type Section = { id: string; label: string; shortcuts: Item[] };

export function ShortcutsView({ sections }: { sections: Section[] }) {
  const [q, setQ] = useState("");
  const [current, setCurrent] = useState<string | null>(null);
  const visible = useMemo(
    () =>
      sections
        .filter((s) => !current || s.id === current)
        .map((s) => ({ ...s, shortcuts: searchShortcuts(s.shortcuts as Shortcut[], q) }))
        .filter((s) => s.shortcuts.length > 0),
    [sections, current, q],
  );
  const total = sections.reduce((n, s) => n + s.shortcuts.length, 0);

  async function copy(keys: string[]) {
    const text = keys.join(" + ");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copiado: ${text}`);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  if (!sections.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhum atalho disponível para as abas ligadas.</CardContent>
      </Card>
    );
  }

  const chip = (id: string | null, label: string, count: number) => (
    <button
      key={id ?? "all"}
      type="button"
      aria-pressed={current === id}
      onClick={() => setCurrent(id)}
      className={cn(
        "flex items-center justify-between gap-3 rounded-md px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
        current === id && "bg-muted font-medium text-foreground",
      )}
    >
      {label}
      <span className="rounded bg-background/60 px-1.5 text-xs tabular-nums">{count}</span>
    </button>
  );

  return (
    <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
      {/* Categorias: lateral no computador, linha compacta no celular. */}
      <nav aria-label="Seções de atalhos" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        {chip(null, "Todas", total)}
        {sections.map((s) => chip(s.id, s.label, s.shortcuts.length))}
      </nav>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Buscar atalho" placeholder="Buscar atalho ou funcionalidade..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
        {visible.map((s) => (
          <Card key={s.id}>
            <CardContent className="flex flex-col gap-1">
              <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
                <Keyboard className="size-4 text-muted-foreground" /> {s.label}
                <span className="text-xs font-normal text-muted-foreground">({s.shortcuts.length})</span>
              </h2>
              <ul className="divide-y" aria-label={`Atalhos de ${s.label}`}>
                {s.shortcuts.map((x) => (
                  <li key={x.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:gap-4">
                    <button
                      type="button"
                      onClick={() => copy(x.keys)}
                      title="Copiar a combinação"
                      aria-label={`Copiar ${x.keys.join(" + ")}`}
                      className="flex w-fit shrink-0 items-center gap-1 rounded-md p-0.5 hover:bg-muted sm:w-40"
                    >
                      {x.keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && <span className="text-xs text-muted-foreground">+</span>}
                          <kbd className="min-w-7 rounded border border-b-2 bg-muted px-1.5 py-0.5 text-center font-mono text-xs">{k}</kbd>
                        </span>
                      ))}
                    </button>
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">{x.action}</p>
                      <p className="text-muted-foreground">{x.description}</p>
                      <p className="text-xs text-muted-foreground/80">{x.when}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
        {!visible.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum atalho encontrado para “{q}”.</p>}
      </div>
    </div>
  );
}
