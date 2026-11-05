"use client";

import { useState, useTransition } from "react";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import type { CardAccount } from "@/lib/cards/accounts";
import { safeAction } from "@/lib/safe-action";
import { setCardDueDayAction } from "./actions";

/** Dia de vencimento da fatura de cada cartão/conta (1–31), salvo ao sair do campo. */
export function DueDays({ accounts, colors }: { accounts: CardAccount[]; colors: Record<number, string> }) {
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [pending, start] = useTransition();

  function save(a: CardAccount) {
    const raw = (draft[a.id] ?? "").trim();
    const day = raw === "" ? null : Number(raw);
    if (day === a.dueDay) return;
    if (day !== null && !(Number.isInteger(day) && day >= 1 && day <= 31)) {
      toast.error("O vencimento deve ser um dia de 1 a 31");
      setDraft((s) => ({ ...s, [a.id]: a.dueDay === null ? "" : String(a.dueDay) }));
      return;
    }
    start(async () => {
      const r = await safeAction(() => setCardDueDayAction(a.id, day));
      if (r.ok) toast.success(day === null ? `Vencimento de ${a.name} removido` : `${a.name}: vence todo dia ${day}`);
      else toast.error(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-muted/40 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <CalendarClock className="size-4 text-muted-foreground" /> Vencimento das faturas
        </span>
        {accounts.map((a) => (
          <label key={a.id} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 rounded-full" style={{ background: colors[a.id] }} />
            {a.name}: dia
            <Input
              aria-label={`Dia de vencimento de ${a.name}`}
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              placeholder="—"
              disabled={pending}
              className="h-8 w-16"
              value={draft[a.id] ?? (a.dueDay === null ? "" : String(a.dueDay))}
              onChange={(e) => setDraft((s) => ({ ...s, [a.id]: e.target.value }))}
              onBlur={() => save(a)}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        A fatura de um mês é paga no mês seguinte, no dia do vencimento (ex.: a fatura de outubro vence em novembro). No Resumo, as
        faturas contam na data em que vencem; sem dia informado, considera-se o dia 1.
      </p>
    </div>
  );
}
