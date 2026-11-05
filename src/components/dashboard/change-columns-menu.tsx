"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChangeKey = "change24h" | "change7d" | "change1m" | "change6m" | "change1y";

export const CHANGE_COLUMNS: { key: ChangeKey; label: string }[] = [
  { key: "change24h", label: "24H" },
  { key: "change7d", label: "1S" },
  { key: "change1m", label: "1M" },
  { key: "change6m", label: "6M" },
  { key: "change1y", label: "1A" },
];

const STORAGE = "ativos-variacoes";
const ALL = CHANGE_COLUMNS.map((c) => c.key);

// A escolha fica guardada só neste navegador (localStorage). Se o navegador bloquear o armazenamento,
// vale até recarregar a página (memória).
let memory: string | null = null;
const listeners = new Set<() => void>();

function readRaw(): string {
  if (memory !== null) return memory;
  try {
    return localStorage.getItem(STORAGE) ?? "";
  } catch {
    return "";
  }
}

function parseShown(raw: string): ChangeKey[] {
  try {
    const list: unknown = JSON.parse(raw);
    if (Array.isArray(list)) return ALL.filter((k) => list.includes(k));
  } catch {}
  return ALL;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Variações visíveis na tabela de ativos e a função para trocar (todas visíveis por padrão). */
export function useShownChanges(): [ChangeKey[], (keys: ChangeKey[]) => void] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const shown = useMemo(() => parseShown(raw), [raw]);
  const set = (keys: ChangeKey[]) => {
    memory = JSON.stringify(ALL.filter((k) => keys.includes(k)));
    try {
      localStorage.setItem(STORAGE, memory);
    } catch {}
    listeners.forEach((fn) => fn());
  };
  return [shown, set];
}

function Pill({ label, kind, onClick }: { label: string; kind: "shown" | "hidden"; onClick: () => void }) {
  const Icon = kind === "shown" ? Minus : Plus;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${kind === "shown" ? "Ocultar" : "Mostrar"} ${label}`}
      className={cn(
        "relative rounded-md bg-muted px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted/70",
        kind === "shown" ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {label}
      <span className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-muted-foreground/60 text-background">
        <Icon className="size-3" strokeWidth={3} />
      </span>
    </button>
  );
}

/** Seta ao lado do título "Ativos": escolhe quais variações (24H, 1S, 1M, 6M, 1A) aparecem na tabela. */
export function ChangeColumnsMenu({ shown, onChange }: { shown: ChangeKey[]; onChange: (keys: ChangeKey[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const set = onChange;
  const visible = CHANGE_COLUMNS.filter((c) => shown.includes(c.key));
  const hidden = CHANGE_COLUMNS.filter((c) => !shown.includes(c.key));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Escolher períodos da tabela"
        className="grid size-6 place-items-center rounded text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {open ? "▲" : "▼"}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Períodos da tabela"
          className="absolute top-8 left-0 z-20 w-72 rounded-xl border bg-popover p-4 text-popover-foreground shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">Exibidos</span>
            <button
              type="button"
              onClick={() => set(shown.length ? [] : ALL)}
              className="text-sm font-medium text-amber-400 hover:text-amber-300"
            >
              {shown.length ? "Ocultar todos" : "Mostrar todos"}
            </button>
          </div>
          <div className="grid min-h-9 grid-cols-4 gap-2.5">
            {visible.map((c) => (
              <Pill key={c.key} label={c.label} kind="shown" onClick={() => set(shown.filter((k) => k !== c.key))} />
            ))}
            {!visible.length && <span className="col-span-4 text-sm text-muted-foreground">Nenhum período na tabela.</span>}
          </div>
          <div className="mt-4 mb-3 text-sm font-medium">Disponíveis</div>
          <div className="grid min-h-9 grid-cols-4 gap-2.5">
            {hidden.map((c) => (
              <Pill key={c.key} label={c.label} kind="hidden" onClick={() => set([...shown, c.key])} />
            ))}
            {!hidden.length && <span className="col-span-4 text-sm text-muted-foreground">Todos estão na tabela.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
