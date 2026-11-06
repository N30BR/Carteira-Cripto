"use client";

import { useMemo, useState, useTransition } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteTransactionAction, saveTransactionAction, type TransactionForm } from "@/app/(app)/lancamentos/transaction-actions";
import { pageWindow } from "@/lib/pagination";
import { safeAction } from "@/lib/safe-action";
import { CURRENCY_SYMBOL, type RefCurrency } from "@/lib/currency";
import type { Transaction } from "@/lib/transactions/store";
import { FilterTabs, KindBadge, SignedMoney, dateBr } from "./ui";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30";

const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

type Draft = { date: string; kind: "" | "in" | "out"; description: string; amount: string };

/** Formulário de transação numa fileira: Data, Entrada/Saída, Descrição, Valor e o botão. */
export function TransactionFormRow({
  initial,
  editId = null,
  submitLabel,
  onDone,
  layout = "row",
  onCancel,
}: {
  initial: Draft;
  editId?: number | null;
  submitLabel: string;
  /** Depois de salvar; recebe o que foi enviado (a janela usa para lembrar data e tipo no próximo). */
  onDone?: (saved: Draft) => void;
  /** "row": em fileira; "modal": em janela, com Cancelar (mesmos campos e regras). */
  layout?: "row" | "modal";
  onCancel?: () => void;
}) {
  const [f, setF] = useState<Draft>(initial);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF((s) => ({ ...s, [k]: v }));
  const prefix = editId === null ? "tx" : `tx-${editId}`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await safeAction(() => saveTransactionAction(editId, f as TransactionForm));
      if (r.ok) {
        setError(undefined);
        // Nova transação: limpa os campos, mas mantém a data e o tipo para a próxima.
        if (editId === null) setF({ ...initial, date: f.date, kind: f.kind });
        // Avisa a data: lançada em outro mês, ela aparece quando esse mês for escolhido.
        toast.success(`${editId === null ? "Transação lançada" : "Transação atualizada"} em ${dateBr(f.date)}`);
        onDone?.(f);
      } else setError(r.error);
    });
  }

  const modal = layout === "modal";
  return (
    <form onSubmit={submit} className={modal ? "flex flex-col gap-4" : "flex flex-col gap-2"}>
      <div
        className={
          modal
            ? "grid gap-3 sm:grid-cols-2 sm:items-end"
            : "grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_2fr_minmax(130px,1fr)_auto] lg:items-end"
        }
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${prefix}-date`}>Data *</Label>
          <Input
            id={`${prefix}-date`}
            type="date"
            min="2000-01-01"
            max="2099-12-31"
            className="[color-scheme:dark]"
            value={f.date}
            onChange={(e) => set("date", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${prefix}-kind`}>Entrada / Saída *</Label>
          <select id={`${prefix}-kind`} className={selectClass} value={f.kind} onChange={(e) => set("kind", e.target.value as Draft["kind"])}>
            <option value="">Selecione...</option>
            <option value="in">Entrada</option>
            <option value="out">Saída</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${prefix}-desc`}>Descrição *</Label>
          <Input
            id={`${prefix}-desc`}
            placeholder="Ex.: Recebimento de serviço"
            maxLength={80}
            value={f.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${prefix}-amount`}>Valor (R$) *</Label>
          <Input id={`${prefix}-amount`} inputMode="decimal" placeholder="0,00" value={f.amount} onChange={(e) => set("amount", e.target.value)} />
        </div>
        {!modal && (
          <Button type="submit" disabled={pending} className="h-9">
            <Plus /> {submitLabel}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {modal && (
        <div className="flex justify-end gap-2 border-t pt-4">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
          )}
          <Button type="submit" disabled={pending} className="h-9">
            <Plus /> {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}

export const emptyDraft = (date: string): Draft => ({ date, kind: "", description: "", amount: "" });

/** Tabela de transações com filtro Todas/Entradas/Saídas, busca, edição e exclusão. */
export function TransactionsTable({
  items,
  emptyText,
  kindHeader = "Entrada / Saída",
  currency = "BRL",
  factor = 1,
  pageSize,
  formLayout = "row",
}: {
  items: Transaction[];
  emptyText: string;
  kindHeader?: string;
  /** Moeda de exibição; `factor` converte centavos de real em unidades mínimas dela. */
  currency?: RefCurrency;
  factor?: number;
  /** Linhas por página (sem valor: todas numa página só). */
  pageSize?: number;
  /** Disposição do formulário de edição. */
  formLayout?: "row" | "modal";
}) {
  const [filter, setFilter] = useState<"ALL" | "in" | "out">("ALL");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [pending, start] = useTransition();

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter((t) => t.description.toLowerCase().includes(q)) : items;
  }, [items, search]);
  const filtered = filter === "ALL" ? searched : searched.filter((t) => t.kind === filter);
  const [page, setPage] = useState(0);
  const pages = pageSize ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
  const current = Math.min(page, pages - 1);
  const visible = pageSize ? filtered.slice(current * pageSize, (current + 1) * pageSize) : filtered;

  function remove(t: Transaction) {
    if (!confirm(`Excluir "${t.description}" (${dateBr(t.date)})? Essa ação não pode ser desfeita.`)) return;
    start(async () => {
      const r = await safeAction(() => deleteTransactionAction(t.id));
      if (r.ok) toast.success("Transação excluída");
      else toast.error(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          label="Filtrar transações"
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(0);
          }}
          options={[
            { value: "ALL", label: "Todas", count: searched.length },
            { value: "in", label: "Entradas", count: searched.filter((t) => t.kind === "in").length },
            { value: "out", label: "Saídas", count: searched.filter((t) => t.kind === "out").length },
          ]}
        />
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar transação por descrição"
            placeholder="Buscar por descrição..."
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <Table aria-label="Transações">
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>{kindHeader}</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Valor ({CURRENCY_SYMBOL[currency]})</TableHead>
              <TableHead className="text-center">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {items.length === 0 ? emptyText : "Nenhuma transação com esses filtros."}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="tabular-nums">{dateBr(t.date)}</TableCell>
                  <TableCell>
                    <KindBadge kind={t.kind} />
                  </TableCell>
                  <TableCell className="max-w-[28ch] truncate" title={t.description}>
                    {t.description}
                  </TableCell>
                  <TableCell className="text-right">
                    <SignedMoney cents={(t.kind === "in" ? t.amountCents : -t.amountCents) * factor} currency={currency} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1">
                      <Button size="icon-sm" variant="ghost" className="text-sky-400" aria-label={`Editar ${t.description}`} onClick={() => setEditing(t)}>
                        <Pencil />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive"
                        aria-label={`Excluir ${t.description}`}
                        disabled={pending}
                        onClick={() => remove(t)}
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
      {pageSize && filtered.length > 0 && <Pager label="transações" shown={visible.length} total={filtered.length} page={current} pages={pages} onPage={setPage} />}

      <Dialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className={formLayout === "modal" ? "sm:max-w-2xl" : "sm:max-w-4xl"}>
          <DialogHeader>
            <DialogTitle>Editar transação</DialogTitle>
          </DialogHeader>
          {editing && (
            <TransactionFormRow
              key={editing.id}
              editId={editing.id}
              submitLabel="Salvar"
              initial={{ date: editing.date, kind: editing.kind, description: editing.description, amount: centsToInput(editing.amountCents) }}
              onDone={() => setEditing(null)}
              layout={formLayout}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Paginação simples: "Mostrando X de Y" e páginas. */
export function Pager({ label, shown, total, page, pages, onPage }: { label: string; shown: number; total: number; page: number; pages: number; onPage: (p: number) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>
        Mostrando {shown} de {total} {label}
      </span>
      {pages > 1 && (
        <nav aria-label={`Páginas de ${label}`} className="flex items-center gap-1">
          <Button size="icon-sm" variant="outline" aria-label="Página anterior" disabled={page === 0} onClick={() => onPage(page - 1)}>
            ‹
          </Button>
          {pageWindow(page, pages).map((i, k) =>
            i === null ? (
              <span key={`gap-${k}`} className="px-1">
                …
              </span>
            ) : (
              <Button key={i} size="icon-sm" variant={i === page ? "default" : "outline"} aria-current={i === page ? "page" : undefined} onClick={() => onPage(i)}>
                {i + 1}
              </Button>
            ),
          )}
          <Button size="icon-sm" variant="outline" aria-label="Próxima página" disabled={page === pages - 1} onClick={() => onPage(page + 1)}>
            ›
          </Button>
        </nav>
      )}
    </div>
  );
}
