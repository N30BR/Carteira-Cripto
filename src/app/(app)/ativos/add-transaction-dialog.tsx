"use client";

// "+Transação": soma uma quantidade a uma cripto que já está no portfólio (ex.: comprou mais 0,1 BTC).
// A soma é feita no servidor, com decimais exatos; a quantidade anterior não é substituída.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatQty } from "@/lib/format";
import type { Holding } from "@/lib/holdings/holdings";
import { safeAction } from "@/lib/safe-action";
import { addTransactionAction } from "./actions";

export function AddTransactionDialog({ holdings }: { holdings: Holding[] }) {
  const [open, setOpen] = useState(false);
  const [holdingId, setHoldingId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const chosen = holdings.find((h) => String(h.id) === holdingId);

  function reset(v: boolean) {
    setOpen(v);
    if (!v) {
      setHoldingId("");
      setQuantity("");
      setError(undefined);
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen) return setError("Escolha uma moeda do portfólio");
    start(async () => {
      const r = await safeAction(() => addTransactionAction(chosen.id, quantity));
      if (r.ok) {
        toast.success(`${chosen.symbol}: agora ${"quantity" in r ? formatQty(r.quantity) : ""}`);
        reset(false);
      } else setError(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={!holdings.length} title={holdings.length ? undefined : "Adicione uma moeda primeiro"}>
          +Transação
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova transação</DialogTitle>
          <DialogDescription>Some uma quantidade a uma criptomoeda que já está no portfólio. A quantidade atual não é substituída.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="tx-coin">Moeda</Label>
            <select
              id="tx-coin"
              value={holdingId}
              onChange={(e) => {
                setHoldingId(e.target.value);
                setError(undefined);
              }}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Selecione...</option>
              {holdings.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.symbol} — {h.name} ({formatQty(h.quantity)})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tx-qty">Quantidade adicionada{chosen ? ` de ${chosen.symbol}` : ""}</Label>
            <Input id="tx-qty" inputMode="decimal" placeholder="0,1" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-invalid={!!error} />
            {chosen && <p className="text-xs text-muted-foreground">Quantidade atual: {formatQty(chosen.quantity)}. O valor informado é somado a ela.</p>}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!chosen || !quantity.trim() || pending}>
              Somar ao portfólio
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
