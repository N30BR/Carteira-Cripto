"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/currency";
import type { FiatAccount, Result } from "@/lib/fiat/accounts";
import { safeAction } from "@/lib/safe-action";
import { createAccountAction, deleteAccountAction, renameAccountAction, setBalanceAction } from "./fiat-actions";

function formatDate(d: string): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

type Field = {
  name: string;
  label: string;
  type?: "text" | "date";
  placeholder?: string;
  initial?: string;
  min?: string;
  max?: string;
};

/** Diálogo pequeno com campos de texto; mantém o que foi digitado quando há erro. */
function FormDialog({
  trigger,
  title,
  description,
  fields,
  submitLabel,
  onSubmit,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  fields: Field[];
  submitLabel: string;
  onSubmit: (values: Record<string, string>) => Promise<Result>;
}) {
  const initial = () => Object.fromEntries(fields.map((f) => [f.name, f.initial ?? ""]));
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  function change(v: boolean) {
    setOpen(v);
    if (v) setValues(initial());
    setError(undefined);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await safeAction(() => onSubmit(values));
      if (r.ok) {
        change(false);
        toast.success("Salvo");
      } else setError(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {fields.map((f) => (
            <div key={f.name} className="flex flex-col gap-2">
              <Label htmlFor={`fiat-${f.name}`}>{f.label}</Label>
              <Input
                id={`fiat-${f.name}`}
                type={f.type ?? "text"}
                inputMode={f.name === "amount" ? "decimal" : undefined}
                placeholder={f.placeholder}
                min={f.min}
                max={f.max}
                value={values[f.name]}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                autoComplete="off"
              />
            </div>
          ))}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const amountField: Field = { name: "amount", label: "Saldo (R$)", placeholder: "5.230,50" };

export function FiatSection({ accounts, today }: { accounts: FiatAccount[]; today: string }) {
  const [pending, start] = useTransition();
  const dateField: Field = { name: "date", label: "Data do saldo", type: "date", initial: today, min: "2000-01-01", max: today };

  function remove(a: FiatAccount) {
    if (!confirm(`Remover a conta "${a.name}"? O histórico de saldos dela também será apagado.`)) return;
    start(async () => {
      const r = await safeAction(() => deleteAccountAction(a.id));
      if (r.ok) toast.success(`${a.name} removida`);
      else toast.error(r.error);
    });
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="fiat-title">
      <div className="flex items-center justify-between">
        <h2 id="fiat-title" className="text-xl font-semibold">
          Fiduciário
        </h2>
        <FormDialog
          trigger={<Button>Nova conta</Button>}
          title="Nova conta"
          description="Informe o nome da conta e o saldo atual em reais."
          fields={[{ name: "name", label: "Nome da conta", placeholder: "Conta PF" }, amountField, dateField]}
          submitLabel="Criar"
          onSubmit={(v) => createAccountAction(v.name, v.amount, v.date)}
        />
      </div>

      {accounts.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          Nenhuma conta ainda. Clique em <strong>Nova conta</strong> para começar.
        </p>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conta</TableHead>
                <TableHead className="text-center">Saldo</TableHead>
                <TableHead className="text-center">Atualizado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="text-center tabular-nums">{formatMoney(Number(a.amount), "BRL")}</TableCell>
                  <TableCell className="text-center tabular-nums">{formatDate(a.date)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <FormDialog
                        trigger={<Button size="sm">Atualizar saldo</Button>}
                        title={`Atualizar saldo de ${a.name}`}
                        description="Registrar de novo na mesma data substitui o valor daquele dia."
                        fields={[amountField, dateField]}
                        submitLabel="Salvar"
                        onSubmit={(v) => setBalanceAction(a.id, v.amount, v.date)}
                      />
                      <FormDialog
                        trigger={
                          <Button size="sm" variant="outline">
                            Renomear
                          </Button>
                        }
                        title="Renomear conta"
                        fields={[{ name: "name", label: "Nome da conta", initial: a.name }]}
                        submitLabel="Salvar"
                        onSubmit={(v) => renameAccountAction(a.id, v.name)}
                      />
                      <Button size="sm" variant="destructive" disabled={pending} onClick={() => remove(a)}>
                        Remover
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
