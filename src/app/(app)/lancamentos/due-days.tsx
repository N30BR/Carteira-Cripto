"use client";

import { useState, useTransition } from "react";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import type { CardAccount } from "@/lib/cards/accounts";
import { safeAction, type ActionResult } from "@/lib/safe-action";
import { setCardClosingDayAction, setCardDueDayAction } from "./actions";

type Field = "closingDay" | "dueDay";
const LABEL: Record<Field, string> = { closingDay: "fechamento", dueDay: "vencimento" };

/** Dia de fechamento e de vencimento da fatura de cada cartão/conta (1–31), salvos ao sair do campo. */
export function DueDays({ accounts, colors }: { accounts: CardAccount[]; colors: Record<number, string> }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const key = (a: CardAccount, f: Field) => `${a.id}:${f}`;
  const shown = (a: CardAccount, f: Field) => draft[key(a, f)] ?? (a[f] === null ? "" : String(a[f]));

  function save(a: CardAccount, f: Field) {
    const raw = (draft[key(a, f)] ?? "").trim();
    if (draft[key(a, f)] === undefined) return;
    const day = raw === "" ? null : Number(raw);
    if (day === a[f]) return;
    if (day !== null && !(Number.isInteger(day) && day >= 1 && day <= 31)) {
      toast.error(`O ${LABEL[f]} deve ser um dia de 1 a 31`);
      setDraft((s) => ({ ...s, [key(a, f)]: a[f] === null ? "" : String(a[f]) }));
      return;
    }
    const action: (id: number, d: number | null) => Promise<ActionResult> = f === "closingDay" ? setCardClosingDayAction : setCardDueDayAction;
    start(async () => {
      const r = await safeAction(() => action(a.id, day));
      if (r.ok) toast.success(day === null ? `${a.name}: ${LABEL[f]} removido` : `${a.name}: ${LABEL[f]} todo dia ${day}`);
      else toast.error(r.error);
    });
  }

  const dayInput = (a: CardAccount, f: Field) => (
    <Input
      aria-label={`Dia de ${LABEL[f]} de ${a.name}`}
      type="number"
      inputMode="numeric"
      min={1}
      max={31}
      placeholder="—"
      disabled={pending}
      className="h-8 w-16"
      value={shown(a, f)}
      onChange={(e) => setDraft((s) => ({ ...s, [key(a, f)]: e.target.value }))}
      onBlur={() => save(a, f)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-muted/40 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <CalendarClock className="size-4 text-muted-foreground" /> Fechamento e vencimento das faturas
        </span>
        {accounts.map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 rounded-full" style={{ background: colors[a.id] }} />
            {a.name}: fecha dia {dayInput(a, "closingDay")} vence dia {dayInput(a, "dueDay")}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        A fatura de cada mês é paga no próprio mês, no dia do vencimento (ex.: a de novembro fecha dia 11 e vence dia 18). Compras a
        partir do dia de fechamento entram na fatura do mês seguinte. No Resumo, as faturas contam na data em que vencem; sem dia
        informado, considera-se o dia 1.
      </p>
    </div>
  );
}
