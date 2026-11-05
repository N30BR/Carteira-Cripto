"use client";

import { useTransition } from "react";
import { Briefcase, Folder, GraduationCap, Home, Rocket, Star, Wallet } from "lucide-react";
import { toast } from "sonner";
import { safeAction } from "@/lib/safe-action";
import { normalize } from "@/lib/todos/logic";
import type { Group } from "@/lib/todos/store";
import { cn } from "@/lib/utils";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Roda uma action mostrando erro (ou sucesso, se houver mensagem) num aviso.
 * `optimistic` roda dentro da transição, para a tela mudar na hora (useOptimistic) e voltar se der erro.
 */
export function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, success?: string, after?: () => void, optimistic?: () => void) =>
    start(async () => {
      optimistic?.();
      const r = await safeAction(fn);
      if (r.ok) {
        if (success) toast.success(success);
        after?.();
      } else toast.error(r.error);
    });
  return { pending, run };
}

/** Ícone do grupo pelo nome (categorias comuns) ou pelo tipo. */
export function GroupIcon({ group, className }: { group: Pick<Group, "name" | "kind"> | null; className?: string }) {
  const cls = cn("size-4 shrink-0", className);
  if (!group) return <Folder className={cls} />;
  const n = normalize(group.name);
  if (n.includes("profiss") || n.includes("trabalho")) return <Briefcase className={cls} />;
  if (n.includes("estud") || n.includes("mestrado") || n.includes("curso")) return <GraduationCap className={cls} />;
  if (n.includes("financ") || n.includes("cripto") || n.includes("dinheiro")) return <Wallet className={cls} />;
  if (n.includes("casa") || n.includes("lar")) return <Home className={cls} />;
  if (group.kind === "project") return <Rocket className={cls} />;
  return <Folder className={cls} />;
}

/** 1 a 3 estrelas; com `onChange`, vira um seletor. */
export function Stars({ value, onChange, size = "sm" }: { value: 1 | 2 | 3; onChange?: (v: 1 | 2 | 3) => void; size?: "sm" | "md" }) {
  const cls = size === "md" ? "size-5" : "size-3.5";
  return (
    <span className="inline-flex items-center gap-0.5" role={onChange ? "radiogroup" : "img"} aria-label={`Prioridade ${value} de 3`}>
      {([1, 2, 3] as const).map((n) => {
        const icon = <Star className={cn(cls, n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/50")} />;
        return onChange ? (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} estrela${n > 1 ? "s" : ""}`} onClick={() => onChange(n)}>
            {icon}
          </button>
        ) : (
          <span key={n}>{icon}</span>
        );
      })}
    </span>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full", value === 100 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${value}%` }} />
    </div>
  );
}

/** "2026-11-05" → "05/11/2026" (ou "05/11" sem o ano). */
export function formatDay(date: string, withYear = true): string {
  const [y, m, d] = date.split("-");
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
}

export const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30";
