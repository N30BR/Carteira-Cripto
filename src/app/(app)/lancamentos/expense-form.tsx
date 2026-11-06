"use client";

import { useState, useTransition } from "react";
import { Info, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/currency";
import type { CardAccount } from "@/lib/cards/accounts";
import type { Category, Result } from "@/lib/cards/categories";
import { invoiceMonthFor } from "@/lib/cards/due";
import { planFromForm } from "@/lib/cards/installments";
import { monthLabel } from "@/lib/cards/months";
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
  accounts,
  accountsButton,
  editing,
  submitLabel,
  onSubmit,
  onDone,
  layout = "row",
  onCancel,
}: {
  initial: ExpenseForm;
  categories: Category[];
  accounts: CardAccount[];
  /** Botão "+ Adicionar" (gerenciar contas), ao lado da escolha da conta. */
  accountsButton?: React.ReactNode;
  editing?: boolean;
  submitLabel: string;
  onSubmit: (f: ExpenseForm) => Promise<Result>;
  onDone?: () => void;
  /** "row": em fileira na página; "modal": em janela, com Cancelar (mesmos campos e regras). */
  layout?: "row" | "modal";
  onCancel?: () => void;
}) {
  const [f, setF] = useState<ExpenseForm>(initial);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const set = <K extends keyof ExpenseForm>(k: K, v: ExpenseForm[K]) => setF((s) => ({ ...s, [k]: v }));
  // Conta escolhida que deixou de existir (excluída em "Adicionar"): vale a primeira da lista.
  const accountId = accounts.some((a) => a.id === f.accountId) ? f.accountId : (accounts[0]?.id ?? f.accountId);
  const closingDay = accounts.find((a) => a.id === accountId)?.closingDay ?? null;
  // Compra nova (1ª parcela): o mês da fatura sai da data da compra e do fechamento do cartão.
  const auto = !editing && f.current === 1;
  const withInvoice = (next: ExpenseForm): ExpenseForm => {
    if (editing || next.current !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(next.purchaseDate)) return next;
    const day = accounts.find((a) => a.id === next.accountId)?.closingDay ?? null;
    return { ...next, refMonth: invoiceMonthFor(next.purchaseDate, day) };
  };

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
      const r = await safeAction(() => onSubmit({ ...f, accountId }));
      if (r.ok) {
        setError(undefined);
        // Novo lançamento: limpa o formulário, mas mantém o mês e a conta para o próximo.
        if (!editing) setF({ ...initial, refMonth: f.refMonth, accountId });
        onDone?.();
      } else setError(r.error);
    });
  }

  const descField = (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exp-desc">Descrição do custo *</Label>
          <Input id="exp-desc" placeholder="Ex.: Assinatura Netflix" value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={80} />
        </div>
  );
  const amountField = (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exp-amount">Valor (R$) *</Label>
          <Input id="exp-amount" inputMode="decimal" placeholder="0,00" value={f.amount} onChange={(e) => set("amount", e.target.value)} />
        </div>
  );
  const installmentsField = (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exp-current" className="gap-1">
            Parcelas
            <span title="Parcela atual / total de parcelas. Ex.: 3 / 12 = terceira de doze. As parcelas anteriores entram como pagas.">
              <Info className="size-3.5 text-muted-foreground" />
            </span>
          </Label>
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
  );
  const categoryField = (
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
  );
  const accountField = (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exp-account">Cartão / Conta *</Label>
          <div className="flex gap-2">
            <select
              id="exp-account"
              className={selectClass}
              value={accountId}
              onChange={(e) => setF((s) => withInvoice({ ...s, accountId: Number(e.target.value) }))}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {accountsButton}
          </div>
        </div>
  );
  const submitButton = (
        <Button type="submit" disabled={pending} className="h-9">
          <Plus /> {submitLabel}
        </Button>
  );
  const modeField = (
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
  );
  const refMonthField = (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exp-ref">Mês da fatura (parcela atual)</Label>
          <Input id="exp-ref" type="month" className="[color-scheme:dark]" value={f.refMonth} onChange={(e) => set("refMonth", e.target.value)} />
          {auto && closingDay !== null && (
            <span className="text-[11px] text-muted-foreground">Pelo fechamento (dia {closingDay}) e a data da compra</span>
          )}
        </div>
  );
  const dateField = (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exp-date">Data da compra</Label>
          <Input
            id="exp-date"
            type="date"
            className="[color-scheme:dark]"
            value={f.purchaseDate}
            onChange={(e) => setF((s) => withInvoice({ ...s, purchaseDate: e.target.value }))}
          />
        </div>
  );
  const statusField = !editing && (
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
  );
  const notesField = (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exp-notes">Observações</Label>
          <Input id="exp-notes" placeholder="Opcional" value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} />
        </div>
  );
  const summary = (
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{preview ? <span className="priv">{preview}</span> : "Informe o valor e as parcelas para ver o resumo."}</span>
        {error && (
          <span role="alert" className="text-destructive">
            {error}
          </span>
        )}
      </div>
  );

  if (layout === "modal") {
    // Em janela: os mesmos campos, regras e validações, em linhas mais largas.
    return (
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          {descField}
          {amountField}
          {installmentsField}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
          {categoryField}
          {accountField}
        </div>
        <div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr] sm:items-end">
          {modeField}
          {refMonthField}
          {dateField}
        </div>
        <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
          {statusField}
          {notesField}
        </div>
        {summary}
        <div className="flex justify-end gap-2 border-t pt-4">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
          )}
          {submitButton}
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_0.8fr_auto_1.1fr_minmax(250px,1.6fr)_auto] lg:items-end">
        {descField}
        {amountField}
        {installmentsField}
        {categoryField}
        {accountField}
        {submitButton}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[auto_auto_auto_auto_1fr] lg:items-end">
        {modeField}
        {refMonthField}
        {dateField}
        {statusField}
        {notesField}
      </div>
      {summary}
    </form>
  );
}
