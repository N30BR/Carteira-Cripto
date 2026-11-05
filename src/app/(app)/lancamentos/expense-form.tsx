"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/currency";
import type { Category, Result } from "@/lib/cards/categories";
import { planFromForm } from "@/lib/cards/installments";
import { monthLabel } from "@/lib/cards/months";
import type { Side } from "@/lib/cards/store";
import { safeAction } from "@/lib/safe-action";
import { cn } from "@/lib/utils";
import { brlToCents } from "@/lib/validation";
import type { ExpenseForm } from "./actions";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30";

function Toggle<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-9 rounded-md border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-3 text-sm text-muted-foreground",
            value === o.value && "bg-primary font-medium text-primary-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Formulário de compra, usado para lançar (status visível) e para editar (status fica por parcela). */
export function ExpenseFormFields({
  initial,
  categories,
  editing,
  submitLabel,
  onSubmit,
  onDone,
}: {
  initial: ExpenseForm;
  categories: Category[];
  editing?: boolean;
  submitLabel: string;
  onSubmit: (f: ExpenseForm) => Promise<Result>;
  onDone?: () => void;
}) {
  const [f, setF] = useState<ExpenseForm>(initial);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const set = <K extends keyof ExpenseForm>(k: K, v: ExpenseForm[K]) => setF((s) => ({ ...s, [k]: v }));

  const cents = brlToCents(f.amount);
  const plan = cents.ok
    ? planFromForm({ amountCents: cents.value, mode: f.mode, current: f.current, total: f.total, refMonth: f.refMonth, currentPaid: f.currentPaid })
    : null;
  const preview =
    plan && plan.ok
      ? `${plan.installments}× de ${formatMoney(Math.floor(plan.totalCents / plan.installments) / 100, "BRL")} · total ${formatMoney(plan.totalCents / 100, "BRL")} · 1ª fatura ${monthLabel(plan.firstInvoice)}`
      : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await safeAction(() => onSubmit(f));
      if (r.ok) {
        setError(undefined);
        // Novo lançamento: limpa o formulário, mas mantém mês, cartão e tipo para o próximo.
        if (!editing) setF({ ...initial, refMonth: f.refMonth, card: f.card, nature: f.nature });
        onDone?.();
      } else setError(r.error);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_auto_auto_1fr_1.2fr_auto] lg:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exp-desc">Descrição do custo *</Label>
          <Input id="exp-desc" placeholder="Ex.: Assinatura Netflix" value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={80} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exp-amount">Valor (R$) *</Label>
          <Input id="exp-amount" inputMode="decimal" placeholder="0,00" value={f.amount} onChange={(e) => set("amount", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exp-current">Parcelas</Label>
          <div className="flex items-center gap-1">
            <Input
              id="exp-current"
              aria-label="Parcela atual"
              type="number"
              min={1}
              max={48}
              className="w-16"
              value={f.current}
              onChange={(e) => set("current", Number(e.target.value))}
            />
            <span className="text-muted-foreground">/</span>
            <Input
              aria-label="Total de parcelas"
              type="number"
              min={1}
              max={48}
              className="w-16"
              value={f.total}
              onChange={(e) => set("total", Number(e.target.value))}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Tipo *</span>
          <Toggle label="Tipo" value={f.nature} onChange={(v: Side) => set("nature", v)} options={[{ value: "PF", label: "PF" }, { value: "PJ", label: "PJ" }]} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exp-card">Cartão *</Label>
          <select id="exp-card" className={selectClass} value={f.card} onChange={(e) => set("card", e.target.value as Side)}>
            <option value="PF">Cartão PF</option>
            <option value="PJ">Cartão PJ</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exp-cat">Categoria</Label>
          <select
            id="exp-cat"
            className={selectClass}
            value={f.categoryId ?? ""}
            onChange={(e) => set("categoryId", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Selecione...</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={pending} className="h-9">
          + {submitLabel}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[auto_auto_auto_auto_1fr] lg:items-end">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">O valor informado é</span>
          <Toggle
            label="O valor informado é"
            value={f.mode}
            onChange={(v) => set("mode", v)}
            options={[
              { value: "parcela", label: "da parcela" },
              { value: "total", label: "o total" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exp-ref">Mês da fatura (parcela atual)</Label>
          <Input id="exp-ref" type="month" className="[color-scheme:dark]" value={f.refMonth} onChange={(e) => set("refMonth", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exp-date">Data da compra</Label>
          <Input id="exp-date" type="date" className="[color-scheme:dark]" value={f.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} />
        </div>
        {!editing && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Status da parcela atual</span>
            <Toggle
              label="Status da parcela atual"
              value={f.currentPaid ? "pago" : "pendente"}
              onChange={(v) => set("currentPaid", v === "pago")}
              options={[
                { value: "pendente", label: "Pendente" },
                { value: "pago", label: "Pago" },
              ]}
            />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exp-notes">Observações</Label>
          <Input id="exp-notes" placeholder="Opcional" value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{preview ?? "Informe o valor e as parcelas para ver o resumo."}</span>
        {error && (
          <span role="alert" className="text-destructive">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
