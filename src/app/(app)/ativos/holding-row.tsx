"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatQty } from "@/lib/format";
import type { Holding } from "@/lib/holdings/holdings";
import { deleteHoldingAction, updateHoldingAction } from "./actions";

export function HoldingRow({ h }: { h: Holding }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await updateHoldingAction(h.id, value);
      if (r.ok) {
        setEditing(false);
        setError(undefined);
        toast.success(`${h.symbol.toUpperCase()} atualizado`);
      } else setError(r.error);
    });
  }

  function remove() {
    if (!confirm(`Remover ${h.name} da carteira?`)) return;
    start(async () => {
      const r = await deleteHoldingAction(h.id);
      if (r.ok) toast.success(`${h.name} removido`);
      else toast.error(r.error);
    });
  }

  return (
    <TableRow>
      <TableCell>
        <span className="font-medium">{h.name}</span>{" "}
        <span className="text-muted-foreground uppercase">{h.symbol}</span>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {editing ? (
          <form onSubmit={save} className="flex items-start justify-end gap-2">
            <div className="flex flex-col items-end gap-1">
              <Input
                aria-label={`Quantidade de ${h.symbol}`}
                className="h-8 w-40 text-right"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-invalid={!!error}
                autoFocus
              />
              {error && <span className="text-xs text-destructive">{error}</span>}
            </div>
            <Button type="submit" size="sm" disabled={pending}>Salvar</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setError(undefined); }}>
              Cancelar
            </Button>
          </form>
        ) : (
          formatQty(h.quantity)
        )}
      </TableCell>
      <TableCell>
        {!editing && (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setValue(formatQty(h.quantity).replace(/\./g, ""));
                setEditing(true);
              }}
            >
              Editar
            </Button>
            <Button size="sm" variant="destructive" disabled={pending} onClick={remove}>
              Remover
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
