"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type ColumnOption<K extends string> = { key: K; label: string };

/**
 * Guarda quais colunas de variação aparecem numa tabela, só neste navegador (localStorage, chave
 * \`storageKey\`). Se o navegador bloquear o armazenamento, vale até recarregar a página (memória).
 */
export function createColumnStore<K extends string>(storageKey: string, all: readonly K[]) {
  let memory: string | null = null;
  const listeners = new Set<() => void>();

  const readRaw = (): string => {
    if (memory !== null) return memory;
    try {
      return localStorage.getItem(storageKey) ?? "";
    } catch {
      return "";
    }
  };
  const parse = (raw: string): K[] => {
    try {
      const list: unknown = JSON.parse(raw);
      if (Array.isArray(list)) return all.filter((k) => list.includes(k));
    } catch {}
    return [...all];
  };
  const subscribe = (fn: () => void) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  /** Colunas visíveis e a função para trocar (todas visíveis por padrão). */
  return function useShown(): [K[], (keys: K[]) => void] {
    const raw = useSyncExternalStore(subscribe, readRaw, () => "");
    const shown = useMemo(() => parse(raw), [raw]);
    const set = (keys: K[]) => {
      memory = JSON.stringify(all.filter((k) => keys.includes(k)));
      try {
        localStorage.setItem(storageKey, memory);
      } catch {}
      listeners.forEach((fn) => fn());
    };
    return [shown, set];
  };
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

/** Seta ao lado do título de uma tabela: escolhe quais períodos de variação aparecem. */
export function ColumnsMenu<K extends string>({
  columns,
  shown,
  onChange,
}: {
  columns: readonly ColumnOption<K>[];
  shown: K[];
  onChange: (keys: K[]) => void;
}) {
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

  const all = columns.map((c) => c.key);
  const visible = columns.filter((c) => shown.includes(c.key));
  const hidden = columns.filter((c) => !shown.includes(c.key));

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
              onClick={() => onChange(shown.length ? [] : all)}
              className="text-sm font-medium text-amber-400 hover:text-amber-300"
            >
              {shown.length ? "Ocultar todos" : "Mostrar todos"}
            </button>
          </div>
          <div className="grid min-h-9 grid-cols-4 gap-2.5">
            {visible.map((c) => (
              <Pill key={c.key} label={c.label} kind="shown" onClick={() => onChange(shown.filter((k) => k !== c.key))} />
            ))}
            {!visible.length && <span className="col-span-4 text-sm text-muted-foreground">Nenhum período na tabela.</span>}
          </div>
          <div className="mt-4 mb-3 text-sm font-medium">Disponíveis</div>
          <div className="grid min-h-9 grid-cols-4 gap-2.5">
            {hidden.map((c) => (
              <Pill key={c.key} label={c.label} kind="hidden" onClick={() => onChange([...shown, c.key])} />
            ))}
            {!hidden.length && <span className="col-span-4 text-sm text-muted-foreground">Todos estão na tabela.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- tabela de ativos (aba Cripto) ----------
export type ChangeKey = "change24h" | "change7d" | "change1m" | "change6m" | "change1y";

export const CHANGE_COLUMNS: ColumnOption<ChangeKey>[] = [
  { key: "change24h", label: "24H" },
  { key: "change7d", label: "1S" },
  { key: "change1m", label: "1M" },
  { key: "change6m", label: "6M" },
  { key: "change1y", label: "1A" },
];

export const useShownChanges = createColumnStore<ChangeKey>(
  "ativos-variacoes",
  CHANGE_COLUMNS.map((c) => c.key),
);

export function ChangeColumnsMenu({ shown, onChange }: { shown: ChangeKey[]; onChange: (keys: ChangeKey[]) => void }) {
  return <ColumnsMenu columns={CHANGE_COLUMNS} shown={shown} onChange={onChange} />;
}

// ---------- tabela de contas (aba R$) ----------
export type FiatChangeKey = "change1m" | "change2m" | "change3m" | "change1y";

export const FIAT_CHANGE_COLUMNS: ColumnOption<FiatChangeKey>[] = [
  { key: "change1m", label: "1M" },
  { key: "change2m", label: "2M" },
  { key: "change3m", label: "3M" },
  { key: "change1y", label: "1A" },
];

export const useShownFiatChanges = createColumnStore<FiatChangeKey>(
  "contas-variacoes",
  FIAT_CHANGE_COLUMNS.map((c) => c.key),
);
