"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowLeftRight, ArrowUp, CalendarDays, ChevronDown, CircleCheck, CreditCard, FilePlus2, FileText, Hourglass, Info, Layers, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { categoryColor, tagStyle } from "@/components/cards/colors";
import { IconBox, SectionTitle, StatCard, TotalChip, TotalsBar, accountColors, brl, dateBr } from "@/components/finance/ui";
import { Pager, TransactionFormRow, TransactionsTable, emptyDraft, type TxAccount } from "@/components/finance/transactions";
import { MonthPicker } from "@/components/month-picker";
import { Priv } from "@/components/priv";
import type { CardAccount } from "@/lib/cards/accounts";
import { MAX_CARD_ACCOUNTS, type Side } from "@/lib/cards/account-limits";
import type { Category } from "@/lib/cards/categories";
import { monthLabel } from "@/lib/cards/months";
import { dueDate, editAmount } from "@/lib/cards/due";
import type { InstallmentRow, MonthClosePreview } from "@/lib/cards/store";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
  settleInstallmentAction,
  previewMonthCloseAction,
  closeMonthAction,
  updateCardAccountAction,
  type ExpenseForm,
} from "./actions";
import { DueDays } from "./due-days";
import { ExpenseFormFields } from "./expense-form";

/** Linhas por página nas listas de faturas e transações. */
const PAGE_SIZE = 10;
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
  showInvoices,
  showTransactions,
  month,
  today,
  rows,
  categories,
  accounts,
  transactions,
  txAccounts,
  open,
  overdue,
}: {
  /** Contas do R$ (compartilhadas): de onde sai / para onde vai cada transação. */
  txAccounts: TxAccount[];
  showInvoices: boolean;
  showTransactions: boolean;
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
        (status === "ALL" || (status === "paid") === (r.paid || r.settled)) &&
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
  function toggleSettled(r: InstallmentRow) {
    start(async () => {
      const res = await safeAction(() => settleInstallmentAction(r.installmentId, !r.settled));
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

  // Janelas de cadastro/edição (o formulário completo de antes, em janela).
  const [invoiceDialog, setInvoiceDialog] = useState<null | { row: InstallmentRow | null }>(null);
  const [txDialog, setTxDialog] = useState(false);
  // Como o formulário fixo de antes: o próximo cadastro começa com o mês/conta e a data/tipo do anterior.
  const [lastInvoice, setLastInvoice] = useState<{ refMonth: string; accountId: number } | null>(null);
  const [lastTx, setLastTx] = useState<{ date: string; kind: "" | "in" | "out"; accountId: string } | null>(null);
  const [invoicePage, setInvoicePage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const page = Math.min(invoicePage, pageCount - 1);
  const pageRows = visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const paidCount = rows.filter((r) => r.paid || r.settled).length;
  const txIn = transactions.filter((t) => t.kind === "in").reduce((s, t) => s + t.amountCents, 0);
  const txOut = transactions.filter((t) => t.kind === "out").reduce((s, t) => s + t.amountCents, 0);
  const resetPage = () => setInvoicePage(0);
  const editingRow = invoiceDialog?.row ?? null;

  return (
    <div className="flex flex-col gap-6">
      {/* Barra do mês: referência, categorias e aviso */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <IconBox icon={CalendarDays} color="#8b7cf6" />
            <MonthPicker month={month} />
            {showInvoices && <MonthCloseMenu month={month} />}
          </div>
          {showInvoices && <CategoriesDialog categories={categories} />}
          <p className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
            <Info className="size-4 shrink-0 text-[#8b7cf6]" />
            Cadastre novas faturas e transações pelos botões abaixo. Os lançamentos ficam sempre visíveis em listas organizadas.
          </p>
        </CardContent>
      </Card>

      {showInvoices && (
        <Card>
          <CardContent className="flex flex-col gap-5">
            <SectionTitle
              icon={FileText}
              title="Faturas"
              subtitle="Visualize e gerencie as faturas registradas no mês selecionado."
              right={
                <Button onClick={() => setInvoiceDialog({ row: null })}>
                  <Plus /> Nova Fatura
                </Button>
              }
            />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
              <StatCard compact icon={Layers} color="#8b7cf6" title="Lançamentos">
                {rows.length}
              </StatCard>
              <StatCard compact icon={Hourglass} color="#F59E0B" title="Pendentes">
                {rows.length - paidCount}
              </StatCard>
              <StatCard compact icon={CircleCheck} color="#22C55E" title="Pagos">
                {paidCount}
              </StatCard>
              {accounts.map((a) => (
                <StatCard compact key={a.id} icon={CreditCard} color={colorOf(a.id)} title={a.name}>
                  {rows.filter((r) => r.accountId === a.id).length}
                </StatCard>
              ))}
            </div>

            {/* Fechamento e vencimento de cada cartão (configuração que já existia). */}
            <DueDays accounts={accounts} colors={colors} />

            {overdue.count > 0 && (
              <p role="status" className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
                {overdue.count} parcela{overdue.count > 1 ? "s" : ""} de meses anteriores ainda não marcada{overdue.count > 1 ? "s" : ""} como
                paga{overdue.count > 1 ? "s" : ""} (<Priv>{brl(overdue.cents)}</Priv>). Ela{overdue.count > 1 ? "s" : ""} continua
                {overdue.count > 1 ? "m" : ""} em aberto até ser{overdue.count > 1 ? "em" : ""} paga{overdue.count > 1 ? "s" : ""}: volte ao mês dela
                {overdue.count > 1 ? "s" : ""} para marcar.
              </p>
            )}

            <div className="flex flex-wrap items-end gap-3 border-t pt-5">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Categoria
                <select
                  aria-label="Filtrar por categoria"
                  className={selectClass}
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    resetPage();
                  }}
                >
                  <option value="ALL">Todas as categorias</option>
                  {categories.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                  <option value="NONE">{NO_CATEGORY}</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Status
                <select
                  aria-label="Filtrar por status"
                  className={selectClass}
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value as "ALL" | "paid" | "pending");
                    resetPage();
                  }}
                >
                  <option value="ALL">Todos os status</option>
                  <option value="paid">Pago</option>
                  <option value="pending">Pendente</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Cartão / Conta
                <select
                  aria-label="Filtrar por conta"
                  className={selectClass}
                  value={account}
                  onChange={(e) => {
                    setAccount(e.target.value);
                    resetPage();
                  }}
                >
                  <option value="ALL">Todos os cartões ({base.length})</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={String(a.id)}>
                      {a.name} ({base.filter((r) => r.accountId === a.id).length})
                    </option>
                  ))}
                </select>
              </label>
              <div className="relative ml-auto w-full sm:w-72">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Buscar por descrição"
                  placeholder="Buscar por descrição..."
                  className="pl-8"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    resetPage();
                  }}
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
                    pageRows.map((r) => (
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
                        <TableCell className="text-right tabular-nums">
                          <Priv>{brl(r.amountCents)}</Priv>
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                            {r.number} / {r.installments}
                          </span>
                          {r.installments > 1 && (
                            <span className="priv block text-[11px] text-muted-foreground">
                              {open[r.expenseId] ? `faltam ${open[r.expenseId].remainingCount} • ${brl(open[r.expenseId].remainingCents)}` : "quitada"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {monthLabel(r.invoiceMonth)}
                          <span className="block text-[11px] text-muted-foreground">
                            vence{" "}
                            {dateBr(
                              dueDate(
                                r.invoiceMonth,
                                accounts.find((a) => a.id === r.accountId)?.dueDay ?? null,
                                accounts.find((a) => a.id === r.accountId)?.closingDay ?? null,
                              ),
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-start gap-0.5 text-xs">
                            <label className="flex cursor-pointer items-center gap-1.5" title="Paga: desconta o valor da conta vinculada">
                              <input type="checkbox" disabled={pending} checked={r.paid} onChange={() => toggle(r)} aria-label={`Paga: ${r.description}`} />
                              <span className={r.paid ? "font-medium text-green-500" : "text-muted-foreground"}>Paga</span>
                            </label>
                            <label className="flex cursor-pointer items-center gap-1.5" title="Quitada: encerra a parcela sem alterar o saldo">
                              <input type="checkbox" disabled={pending} checked={r.settled} onChange={() => toggleSettled(r)} aria-label={`Quitada: ${r.description}`} />
                              <span className={r.settled ? "font-medium text-sky-400" : "text-muted-foreground"}>Quitada</span>
                            </label>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-center gap-1">
                            <Button size="icon-sm" variant="ghost" className="text-sky-400" aria-label={`Editar ${r.description}`} onClick={() => setInvoiceDialog({ row: r })}>
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
            {visible.length > 0 && <Pager label="faturas" shown={pageRows.length} total={visible.length} page={page} pages={pageCount} onPage={setInvoicePage} />}

            <TotalsBar
              label={`Totais do mês (${monthLabel(month)})`}
              final={
                <span data-testid="month-total">
                  Total: <Priv>{brl(totals.total)}</Priv>
                </span>
              }
            >
              {accounts.map((a) => (
                <TotalChip key={a.id} color={colors[a.id]}>
                  {a.name}: <Priv>{brl(totals.byAccount[a.id] ?? 0)}</Priv>
                </TotalChip>
              ))}
            </TotalsBar>
          </CardContent>
        </Card>
      )}

      {showTransactions && (
        <Card>
          <CardContent className="flex flex-col gap-5">
            <SectionTitle
              icon={ArrowLeftRight}
              title="Transações"
              subtitle="Visualize entradas e saídas avulsas (receitas, pagamentos, transferências, etc.)."
              right={
                <Button onClick={() => setTxDialog(true)}>
                  <Plus /> Nova Transação
                </Button>
              }
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard compact icon={ArrowUp} color="#22C55E" title="Entradas">
                <Priv>{brl(txIn)}</Priv>
              </StatCard>
              <StatCard compact icon={ArrowDown} color="#EF4444" title="Saídas">
                <Priv>{brl(txOut)}</Priv>
              </StatCard>
              <StatCard compact icon={ArrowLeftRight} color="#60A5FA" title="Saldo">
                <Priv>{brl(txIn - txOut)}</Priv>
              </StatCard>
            </div>
            <TransactionsTable items={transactions} emptyText={`Nenhuma transação em ${monthLabel(month)}.`} pageSize={PAGE_SIZE} formLayout="modal" accounts={txAccounts} />
          </CardContent>
        </Card>
      )}

      {/* Nova fatura / editar fatura: o formulário completo, na mesma janela. */}
      <Dialog open={invoiceDialog !== null} onOpenChange={(v) => !v && setInvoiceDialog(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FilePlus2 className="size-5 text-[#8b7cf6]" /> {editingRow ? "Editar Fatura" : "Nova Fatura"}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {editingRow ? "As parcelas são recalculadas; as que já estavam pagas continuam pagas." : "Cadastre uma nova fatura para controle e acompanhamento."}
            </p>
          </DialogHeader>
          {invoiceDialog && (
            <ExpenseFormFields
              key={editingRow ? editingRow.installmentId : "new"}
              layout="modal"
              initial={
                editingRow
                  ? formFromRow(editingRow)
                  : { ...emptyForm(month, today, accounts[0]?.id ?? 0), ...(lastInvoice && accounts.some((a) => a.id === lastInvoice.accountId) ? lastInvoice : {}) }
              }
              categories={categories}
              accounts={accounts}
              accountsButton={editingRow ? undefined : <AccountsDialog accounts={accounts} />}
              editing={!!editingRow}
              submitLabel={editingRow ? "Salvar alterações" : "Salvar Fatura"}
              onSubmit={(f) => saveExpenseAction(editingRow ? editingRow.expenseId : null, f)}
              onCancel={() => setInvoiceDialog(null)}
              onDone={(saved) => {
                if (!editingRow) setLastInvoice({ refMonth: saved.refMonth, accountId: saved.accountId });
                setInvoiceDialog(null);
                toast.success(editingRow ? "Lançamento atualizado" : "Fatura lançada");
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Nova transação: o formulário completo, em janela. */}
      <Dialog open={txDialog} onOpenChange={setTxDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova Transação</DialogTitle>
            <p className="text-sm text-muted-foreground">Registre uma entrada ou saída avulsa.</p>
          </DialogHeader>
          {txDialog && (
            <TransactionFormRow
              initial={lastTx ? { ...emptyDraft(lastTx.date, lastTx.accountId), kind: lastTx.kind } : emptyDraft(txDefaultDate)}
              submitLabel="Salvar Transação"
              layout="modal"
              accounts={txAccounts}
              onCancel={() => setTxDialog(false)}
              onDone={(saved) => {
                setLastTx({ date: saved.date, kind: saved.kind, accountId: saved.accountId });
                setTxDialog(false);
              }}
            />
          )}
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

/**
 * Fechamento mensal: marca todas as parcelas em aberto do mês como pagas (desconta cada uma da conta da fatura)
 * ou quitadas (sem mexer em saldo), depois de uma confirmação com o resumo.
 */
function MonthCloseMenu({ month }: { month: string }) {
  const [confirm, setConfirm] = useState<{ mode: "paid" | "settled"; preview: MonthClosePreview } | null>(null);
  const [pending, start] = useTransition();
  const ask = (mode: "paid" | "settled") =>
    start(async () => {
      const r = await safeAction(() => previewMonthCloseAction(month));
      if (!r.ok) return void toast.error(r.error);
      setConfirm({ mode, preview: r as MonthClosePreview });
    });
  const run = () =>
    confirm &&
    start(async () => {
      const r = await safeAction(() => closeMonthAction(month, confirm.mode));
      if (!r.ok) return void toast.error(r.error);
      toast.success(`${"count" in r ? r.count : 0} parcela(s) de ${monthLabel(month)} marcada(s) como ${confirm.mode === "paid" ? "paga(s)" : "quitada(s)"}`);
      setConfirm(null);
    });
  const p = confirm?.preview;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={pending}>
            Fechamento mensal <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => ask("paid")}>Marcar mês como pago</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => ask("settled")}>Marcar mês como quitado</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirm?.mode === "paid" ? "Marcar mês como pago" : "Marcar mês como quitado"}</DialogTitle>
          </DialogHeader>
          {p && (
            <div className="flex flex-col gap-2 text-sm">
              <p>
                Mês: <strong>{monthLabel(p.month)}</strong>
              </p>
              <p>
                Parcelas em aberto afetadas: <strong>{p.count}</strong> · Total: <strong className="priv">{brl(p.totalCents)}</strong>
              </p>
              {p.count === 0 && <p className="text-muted-foreground">Nenhuma parcela em aberto neste mês.</p>}
              {confirm?.mode === "paid" ? (
                <>
                  <p className="text-amber-400">Os valores serão descontados dos saldos das contas abaixo.</p>
                  <ul className="list-inside list-disc text-muted-foreground">
                    {p.accounts.map((a) => (
                      <li key={a.name}>
                        {a.name}: <span className="priv">− {brl(a.cents)}</span>
                      </li>
                    ))}
                  </ul>
                  {p.withoutAccount > 0 && <p className="text-xs text-muted-foreground">{p.withoutAccount} parcela(s) sem conta: marcadas como pagas sem desconto.</p>}
                </>
              ) : (
                <p className="text-muted-foreground">Nenhum saldo será alterado (quitar encerra as parcelas sem movimentação).</p>
              )}
              <p className="text-xs text-muted-foreground">Parcelas já pagas ou quitadas e os outros meses não mudam.</p>
            </div>
          )}
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button disabled={pending || !p?.count} onClick={run}>
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
