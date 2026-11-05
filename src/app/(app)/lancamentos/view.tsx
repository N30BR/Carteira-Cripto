"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeftRight, FileText, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { categoryColor, tagStyle } from "@/components/cards/colors";
import { FilterTabs, SectionTitle, TotalChip, TotalsBar, accountColors, brl, dateBr } from "@/components/finance/ui";
import { TransactionFormRow, TransactionsTable, emptyDraft } from "@/components/finance/transactions";
import { MonthPicker } from "@/components/month-picker";
import type { CardAccount } from "@/lib/cards/accounts";
import { MAX_CARD_ACCOUNTS, type Side } from "@/lib/cards/account-limits";
import type { Category } from "@/lib/cards/categories";
import { monthLabel } from "@/lib/cards/months";
import { dueDate, editAmount } from "@/lib/cards/due";
import type { InstallmentRow } from "@/lib/cards/store";
import { NO_CATEGORY, monthTotals } from "@/lib/cards/summary";
import { safeAction, type ActionResult } from "@/lib/safe-action";
import type { Transaction } from "@/lib/transactions/store";
import {
  createCardAccountAction,
  createCategoryAction,
  deleteCardAccountAction,
  deleteCategoryAction,
  deleteExpenseAction,
  renameCategoryAction,
  saveExpenseAction,
  toggleInstallmentAction,
  updateCardAccountAction,
  type ExpenseForm,
} from "./actions";
import { DueDays } from "./due-days";
import { ExpenseFormFields } from "./expense-form";

const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30";

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap" style={tagStyle(color)}>
      {children}
    </span>
  );
}

function emptyForm(month: string, today: string, accountId: number): ExpenseForm {
  return {
    description: "",
    amount: "",
    mode: "parcela",
    current: 1,
    total: 1,
    refMonth: month,
    purchaseDate: today,
    accountId,
    categoryId: null,
    currentPaid: false,
    notes: "",
  };
}

/** Preenche o formulário de edição a partir da parcela do mês, com o valor do jeito que foi lançado (parcela ou total). */
function formFromRow(r: InstallmentRow): ExpenseForm {
  const amount = editAmount(r);
  return {
    description: r.description,
    amount: centsToInput(amount.amountCents),
    mode: amount.mode,
    current: r.number,
    total: r.installments,
    refMonth: r.invoiceMonth,
    purchaseDate: r.purchaseDate,
    accountId: r.accountId,
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
  accounts,
  transactions,
  open,
  overdue,
}: {
  month: string;
  today: string;
  rows: InstallmentRow[];
  categories: Category[];
  accounts: CardAccount[];
  transactions: Transaction[];
  /** Por compra: parcelas ainda não pagas e quanto falta (até a última parcela). */
  open: Record<number, { remainingCount: number; remainingCents: number }>;
  /** Parcelas de meses anteriores ainda não marcadas como pagas. */
  overdue: { count: number; cents: number };
}) {
  const [account, setAccount] = useState<string>("ALL");
  const [category, setCategory] = useState<string>("ALL");
  const [status, setStatus] = useState<"ALL" | "paid" | "pending">("ALL");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<InstallmentRow | null>(null);
  const [pending, start] = useTransition();
  const colors = accountColors(accounts);
  const colorOf = (id: number) => colors[id] ?? "#94A3B8";
  // Dia padrão do formulário de transações: hoje, se estiver no mês escolhido; senão, o dia 1 do mês.
  const txDefaultDate = today.slice(0, 7) === month ? today : `${month}-01`;

  // Filtros que valem para tudo, menos o da conta (as contagens das abas usam esta base).
  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (category === "ALL" || (category === "NONE" ? r.categoryId === null : String(r.categoryId) === category)) &&
        (status === "ALL" || (status === "paid") === r.paid) &&
        (!q || r.description.toLowerCase().includes(q)),
    );
  }, [rows, category, status, search]);
  const visible = account === "ALL" ? base : base.filter((r) => String(r.accountId) === account);
  const totals = monthTotals(visible);

  function toggle(r: InstallmentRow) {
    start(async () => {
      const res = await safeAction(() => toggleInstallmentAction(r.installmentId, !r.paid));
      if (!res.ok) toast.error(res.error);
    });
  }

  function remove(r: InstallmentRow) {
    const what = r.installments > 1 ? `"${r.description}" e todas as ${r.installments} parcelas` : `"${r.description}"`;
    if (!confirm(`Excluir ${what}? Essa ação não pode ser desfeita.`)) return;
    start(async () => {
      const res = await safeAction(() => deleteExpenseAction(r.expenseId));
      if (res.ok) toast.success("Lançamento excluído");
      else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-5">
          <SectionTitle
            icon={FileText}
            title="Lançamento de Faturas"
            subtitle="Insira, edite e acompanhe os custos do mês, com parcelamento e categorização."
            right={
              <div className="flex flex-wrap items-center gap-2">
                <CategoriesDialog categories={categories} />
                <MonthPicker month={month} />
              </div>
            }
          />
          <DueDays accounts={accounts} colors={colors} />
          <div className="border-t pt-5">
            <ExpenseFormFields
              initial={emptyForm(month, today, accounts[0]?.id ?? 0)}
              categories={categories}
              accounts={accounts}
              accountsButton={<AccountsDialog accounts={accounts} />}
              submitLabel="Lançar Fatura"
              onSubmit={(f) => saveExpenseAction(null, f)}
              onDone={() => toast.success("Fatura lançada")}
            />
          </div>

          {overdue.count > 0 && (
            <p role="status" className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
              {overdue.count} parcela{overdue.count > 1 ? "s" : ""} de meses anteriores ainda não marcada{overdue.count > 1 ? "s" : ""} como
              paga{overdue.count > 1 ? "s" : ""} ({brl(overdue.cents)}). Ela{overdue.count > 1 ? "s" : ""} continua
              {overdue.count > 1 ? "m" : ""} em aberto até ser{overdue.count > 1 ? "em" : ""} paga{overdue.count > 1 ? "s" : ""}: volte ao mês dela
              {overdue.count > 1 ? "s" : ""} para marcar.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t pt-5">
            <FilterTabs
              label="Filtrar por conta"
              value={account}
              onChange={setAccount}
              options={[
                { value: "ALL", label: "Todas", count: base.length },
                ...accounts.map((a) => ({ value: String(a.id), label: a.name, count: base.filter((r) => r.accountId === a.id).length })),
              ]}
            />
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
            <div className="relative ml-auto w-full sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Buscar por descrição"
                placeholder="Buscar por descrição..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <Table aria-label="Faturas do mês">
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Descrição do custo</TableHead>
                  <TableHead className="text-center">Categoria</TableHead>
                  <TableHead className="text-center">Cartão / Conta</TableHead>
                  <TableHead className="text-right">Valor (R$)</TableHead>
                  <TableHead className="text-center">Parcelas</TableHead>
                  <TableHead className="text-center">Mês (Fatura)</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
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
                        <Tag color={categoryColor(r.categoryId)}>{r.categoryName ?? NO_CATEGORY}</Tag>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center gap-1">
                          <Tag color={colorOf(r.accountId)}>{r.accountName}</Tag>
                          <span className="text-[10px] font-semibold text-muted-foreground" title={`Natureza da despesa: ${r.nature}`}>
                            {r.nature}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{brl(r.amountCents)}</TableCell>
                      <TableCell className="text-center tabular-nums">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                          {r.number} / {r.installments}
                        </span>
                        {r.installments > 1 && (
                          <span className="block text-[11px] text-muted-foreground">
                            {open[r.expenseId] ? `faltam ${open[r.expenseId].remainingCount} • ${brl(open[r.expenseId].remainingCents)}` : "quitada"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {monthLabel(r.invoiceMonth)}
                        <span className="block text-[11px] text-muted-foreground">
                          vence {dateBr(dueDate(r.invoiceMonth, accounts.find((a) => a.id === r.accountId)?.dueDay ?? null))}
                        </span>
                      </TableCell>
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
                        <div className="flex justify-center gap-1">
                          <Button size="icon-sm" variant="ghost" className="text-sky-400" aria-label={`Editar ${r.description}`} onClick={() => setEditing(r)}>
                            <Pencil />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="text-destructive"
                            aria-label={`Excluir ${r.description}`}
                            disabled={pending}
                            onClick={() => remove(r)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <TotalsBar
            label={`Totais do mês (${monthLabel(month)})`}
            final={<span data-testid="month-total">Total: {brl(totals.total)}</span>}
          >
            {accounts.map((a) => (
              <TotalChip key={a.id} color={colors[a.id]}>
                {a.name}: {brl(totals.byAccount[a.id] ?? 0)}
              </TotalChip>
            ))}
          </TotalsBar>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-5">
          <SectionTitle
            icon={ArrowLeftRight}
            title="Lançamento de Transações"
            subtitle="Registre entradas e saídas avulsas (receitas, pagamentos, transferências, etc.)."
          />
          <div className="border-t pt-5">
            <TransactionFormRow key={month} initial={emptyDraft(txDefaultDate)} submitLabel="Lançar Transação" />
          </div>
          <TransactionsTable items={transactions} emptyText={`Nenhuma transação em ${monthLabel(month)}.`} />
        </CardContent>
      </Card>

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
              accounts={accounts}
              editing
              submitLabel="Salvar"
              onSubmit={(f) => saveExpenseAction(editing.expenseId, f)}
              onDone={() => {
                setEditing(null);
                toast.success("Lançamento atualizado");
              }}
            />
          )}
          <p className="text-xs text-muted-foreground">As parcelas são recalculadas; as que já estavam pagas continuam pagas.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function useRunToast() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, ok: string, after?: () => void) =>
    start(async () => {
      const r = await safeAction(fn);
      if (r.ok) {
        toast.success(ok);
        after?.();
      } else toast.error(r.error);
    });
  return { pending, run };
}

/** Gerenciar contas/cartões: até 4, cada uma com nome e tipo (PF/PJ). */
function AccountsDialog({ accounts }: { accounts: CardAccount[] }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Side>("PF");
  const [drafts, setDrafts] = useState<Record<number, { name: string; kind: Side }>>({});
  const { pending, run } = useRunToast();
  const draftOf = (a: CardAccount) => drafts[a.id] ?? { name: a.name, kind: a.kind };
  const full = accounts.length >= MAX_CARD_ACCOUNTS;
  const colors = accountColors(accounts);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="h-9 shrink-0 border-sky-500/60 text-sky-400" aria-label="Gerenciar contas">
          <Plus /> Adicionar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cartões / contas</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Até {MAX_CARD_ACCOUNTS} contas. O tipo (PF ou PJ) vale para as próximas compras lançadas na conta. Renomear não altera os
          lançamentos; conta com lançamentos não pode ser excluída.
        </p>
        <ul className="flex flex-col gap-2">
          {accounts.map((a) => {
            const d = draftOf(a);
            const changed = d.name !== a.name || d.kind !== a.kind;
            return (
              <li key={a.id} className="flex items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: colors[a.id] }} />
                <Input
                  aria-label={`Nome da conta ${a.name}`}
                  value={d.name}
                  maxLength={30}
                  onChange={(e) => setDrafts((s) => ({ ...s, [a.id]: { ...d, name: e.target.value } }))}
                />
                <select
                  aria-label={`Tipo da conta ${a.name}`}
                  className={selectClass}
                  value={d.kind}
                  onChange={(e) => setDrafts((s) => ({ ...s, [a.id]: { ...d, kind: e.target.value as Side } }))}
                >
                  <option value="PF">PF</option>
                  <option value="PJ">PJ</option>
                </select>
                <Button size="sm" variant="outline" disabled={pending || !changed} onClick={() => run(() => updateCardAccountAction(a.id, d.name, d.kind), "Conta atualizada")}>
                  Salvar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => confirm(`Excluir "${a.name}"?`) && run(() => deleteCardAccountAction(a.id), "Conta excluída")}
                >
                  Excluir
                </Button>
              </li>
            );
          })}
        </ul>
        {full ? (
          <p className="text-sm text-muted-foreground">Limite de {MAX_CARD_ACCOUNTS} contas atingido.</p>
        ) : (
          <form
            className="flex gap-2 border-t pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => createCardAccountAction(name, kind), "Conta criada", () => setName(""));
            }}
          >
            <Input aria-label="Nova conta" placeholder="Nova conta (ex.: Nubank)" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
            <select aria-label="Tipo da nova conta" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as Side)}>
              <option value="PF">PF</option>
              <option value="PJ">PJ</option>
            </select>
            <Button type="submit" disabled={pending}>
              Criar
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CategoriesDialog({ categories }: { categories: Category[] }) {
  const [name, setName] = useState("");
  const [names, setNames] = useState<Record<number, string>>({});
  const { pending, run } = useRunToast();

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
            run(() => createCategoryAction(name), "Categoria criada", () => setName(""));
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
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: categoryColor(c.id) }} />
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
