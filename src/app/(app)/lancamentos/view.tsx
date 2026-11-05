"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CARD_COLOR, NATURE_COLOR, categoryColor, tagStyle } from "@/components/cards/colors";
import { formatMoney } from "@/lib/currency";
import type { Category } from "@/lib/cards/categories";
import { monthLabel } from "@/lib/cards/months";
import type { InstallmentRow, Side } from "@/lib/cards/store";
import { NO_CATEGORY, monthTotals } from "@/lib/cards/summary";
import { cn } from "@/lib/utils";
import {
  createCategoryAction,
  deleteCategoryAction,
  deleteExpenseAction,
  renameCategoryAction,
  saveExpenseAction,
  toggleInstallmentAction,
  type ExpenseForm,
} from "./actions";
import { ExpenseFormFields } from "./expense-form";

const brl = (cents: number) => formatMoney(cents / 100, "BRL");
const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30";

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium" style={tagStyle(color)}>
      {children}
    </span>
  );
}

function emptyForm(month: string, today: string): ExpenseForm {
  return {
    description: "",
    amount: "",
    mode: "parcela",
    current: 1,
    total: 1,
    refMonth: month,
    purchaseDate: today,
    nature: "PF",
    card: "PF",
    categoryId: null,
    currentPaid: false,
    notes: "",
  };
}

/** Preenche o formulário de edição a partir da parcela do mês (valor total, parcela atual = esta). */
function formFromRow(r: InstallmentRow): ExpenseForm {
  return {
    description: r.description,
    amount: centsToInput(r.totalCents),
    mode: "total",
    current: r.number,
    total: r.installments,
    refMonth: r.invoiceMonth,
    purchaseDate: r.purchaseDate,
    nature: r.nature,
    card: r.card,
    categoryId: r.categoryId,
    currentPaid: r.paid,
    notes: r.notes,
  };
}

export function LaunchesView({
  month,
  today,
  rows,
  categories,
}: {
  month: string;
  today: string;
  rows: InstallmentRow[];
  categories: Category[];
}) {
  const [nature, setNature] = useState<"ALL" | Side>("ALL");
  const [card, setCard] = useState<"ALL" | Side>("ALL");
  const [category, setCategory] = useState<string>("ALL");
  const [status, setStatus] = useState<"ALL" | "paid" | "pending">("ALL");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<InstallmentRow | null>(null);
  const [pending, start] = useTransition();

  // Filtros que valem para tudo, menos o de PF/PJ (as contagens dos botões usam esta base).
  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (card === "ALL" || r.card === card) &&
        (category === "ALL" || (category === "NONE" ? r.categoryId === null : String(r.categoryId) === category)) &&
        (status === "ALL" || (status === "paid") === r.paid) &&
        (!q || r.description.toLowerCase().includes(q)),
    );
  }, [rows, card, category, status, search]);
  const visible = nature === "ALL" ? base : base.filter((r) => r.nature === nature);
  const totals = monthTotals(visible);
  const counts = { ALL: base.length, PF: base.filter((r) => r.nature === "PF").length, PJ: base.filter((r) => r.nature === "PJ").length };

  function toggle(r: InstallmentRow) {
    start(async () => {
      const res = await toggleInstallmentAction(r.installmentId, !r.paid);
      if (!res.ok) toast.error(res.error);
    });
  }

  function remove(r: InstallmentRow) {
    const what = r.installments > 1 ? `"${r.description}" e todas as ${r.installments} parcelas` : `"${r.description}"`;
    if (!confirm(`Excluir ${what}? Essa ação não pode ser desfeita.`)) return;
    start(async () => {
      const res = await deleteExpenseAction(r.expenseId);
      if (res.ok) toast.success("Lançamento excluído");
      else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>⊕ Novo Lançamento</CardTitle>
          <CategoriesDialog categories={categories} />
        </CardHeader>
        <CardContent>
          <ExpenseFormFields
            initial={emptyForm(month, today)}
            categories={categories}
            submitLabel="Adicionar"
            onSubmit={(f) => saveExpenseAction(null, f)}
            onDone={() => toast.success("Lançamento adicionado")}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border p-0.5 text-sm" role="group" aria-label="Filtrar por tipo">
          {(["ALL", "PF", "PJ"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={nature === k}
              onClick={() => setNature(k)}
              className={cn("rounded-md px-3 py-1 text-muted-foreground", nature === k && "bg-muted font-medium text-foreground")}
            >
              {k === "ALL" ? "Todos" : k} ({counts[k]})
            </button>
          ))}
        </div>
        <select aria-label="Filtrar por cartão" className={selectClass} value={card} onChange={(e) => setCard(e.target.value as "ALL" | Side)}>
          <option value="ALL">Todos os cartões</option>
          <option value="PF">Cartão PF</option>
          <option value="PJ">Cartão PJ</option>
        </select>
        <select aria-label="Filtrar por categoria" className={selectClass} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="ALL">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
          <option value="NONE">{NO_CATEGORY}</option>
        </select>
        <select
          aria-label="Filtrar por status"
          className={selectClass}
          value={status}
          onChange={(e) => setStatus(e.target.value as "ALL" | "paid" | "pending")}
        >
          <option value="ALL">Todos os status</option>
          <option value="paid">Pago</option>
          <option value="pending">Pendente</option>
        </select>
        <Input
          aria-label="Buscar por descrição"
          placeholder="🔍 Buscar por descrição..."
          className="ml-auto w-full sm:w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição do custo</TableHead>
              <TableHead className="text-center">Categoria</TableHead>
              <TableHead className="text-center">Tipo</TableHead>
              <TableHead className="text-center">Cartão</TableHead>
              <TableHead className="text-right">Valor (R$)</TableHead>
              <TableHead className="text-center">Parcelas</TableHead>
              <TableHead className="text-center">Mês (Fatura)</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  {rows.length === 0 ? `Nenhum lançamento em ${monthLabel(month)}.` : "Nenhum lançamento com esses filtros."}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((r) => (
                <TableRow key={r.installmentId}>
                  <TableCell className="font-medium" title={r.notes || undefined}>
                    {r.description}
                  </TableCell>
                  <TableCell className="text-center">
                    <Tag color={categoryColor(r.categoryName)}>{r.categoryName ?? NO_CATEGORY}</Tag>
                  </TableCell>
                  <TableCell className="text-center">
                    <Tag color={NATURE_COLOR[r.nature]}>{r.nature}</Tag>
                  </TableCell>
                  <TableCell className="text-center">
                    <Tag color={CARD_COLOR[r.card]}>Cartão {r.card}</Tag>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{brl(r.amountCents)}</TableCell>
                  <TableCell className="text-center tabular-nums">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {r.number}/{r.installments}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">{monthLabel(r.invoiceMonth)}</TableCell>
                  <TableCell className="text-center">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => toggle(r)}
                      title="Clique para alternar"
                      className="rounded-full border px-2 py-0.5 text-xs font-medium"
                      style={tagStyle(r.paid ? "#22C55E" : "#F59E0B")}
                    >
                      {r.paid ? "Pago" : "Pendente"}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" aria-label={`Editar ${r.description}`} onClick={() => setEditing(r)}>
                        ✎
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        aria-label={`Excluir ${r.description}`}
                        disabled={pending}
                        onClick={() => remove(r)}
                      >
                        🗑
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
        <span className="font-medium">Totais do mês ({monthLabel(month)})</span>
        <span className="rounded-lg px-3 py-1.5 font-semibold" style={tagStyle(NATURE_COLOR.PF)}>
          PF: {brl(totals.pf)}
        </span>
        <span className="rounded-lg px-3 py-1.5 font-semibold" style={tagStyle(NATURE_COLOR.PJ)}>
          PJ: {brl(totals.pj)}
        </span>
        <span className="rounded-lg px-3 py-1.5" style={tagStyle(CARD_COLOR.PF)}>
          Cartão PF: {brl(totals.cardPF)}
        </span>
        <span className="rounded-lg px-3 py-1.5" style={tagStyle(CARD_COLOR.PJ)}>
          Cartão PJ: {brl(totals.cardPJ)}
        </span>
        <span className="ml-auto text-base font-semibold" data-testid="month-total">
          Total: {brl(totals.total)}
        </span>
      </div>

      <Dialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Editar lançamento</DialogTitle>
          </DialogHeader>
          {editing && (
            <ExpenseFormFields
              key={editing.installmentId}
              initial={formFromRow(editing)}
              categories={categories}
              editing
              submitLabel="Salvar"
              onSubmit={(f) => saveExpenseAction(editing.expenseId, f)}
              onDone={() => {
                setEditing(null);
                toast.success("Lançamento atualizado");
              }}
            />
          )}
          <p className="text-xs text-muted-foreground">
            As parcelas são recalculadas; as que já estavam pagas continuam pagas.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoriesDialog({ categories }: { categories: Category[] }) {
  const [name, setName] = useState("");
  const [names, setNames] = useState<Record<number, string>>({});
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(ok);
      else toast.error(r.error);
    });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Categorias
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Categorias</DialogTitle>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await createCategoryAction(name);
              if (r.ok) setName("");
              return r;
            }, "Categoria criada");
          }}
        >
          <Input aria-label="Nova categoria" placeholder="Nova categoria" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          <Button type="submit" disabled={pending}>
            Criar
          </Button>
        </form>
        <ul className="flex max-h-80 flex-col gap-2 overflow-auto">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: categoryColor(c.name) }} />
              <Input
                aria-label={`Nome da categoria ${c.name}`}
                value={names[c.id] ?? c.name}
                onChange={(e) => setNames((s) => ({ ...s, [c.id]: e.target.value }))}
                maxLength={40}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={pending || (names[c.id] ?? c.name) === c.name}
                onClick={() => run(() => renameCategoryAction(c.id, names[c.id] ?? c.name), "Categoria renomeada")}
              >
                Salvar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  if (confirm(`Excluir "${c.name}"? Os lançamentos dela ficam "${NO_CATEGORY}".`)) {
                    run(() => deleteCategoryAction(c.id), "Categoria excluída");
                  }
                }}
              >
                Excluir
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
