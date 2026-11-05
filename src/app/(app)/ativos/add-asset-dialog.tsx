"use client";

import { useEffect, useState, useTransition } from "react";
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
import { formatQty, quantityToInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { addHoldingAction } from "./actions";

type Coin = { id: string; symbol: string; name: string };

export function AddAssetDialog({ owned }: { owned: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Coin[]>([]);
  const [searchError, setSearchError] = useState<string>();
  const [coin, setCoin] = useState<Coin | null>(null);
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/coins/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const body = await res.json();
        if (!res.ok) {
          setSearchError(body.error ?? "Busca indisponível");
          setResults([]);
        } else {
          setSearchError(undefined);
          setResults(body);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setSearchError("Busca indisponível");
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  const visible = query.trim().length >= 2 ? results : [];

  function choose(c: Coin) {
    setCoin(c);
    setQuantity(owned[c.id] ? quantityToInput(owned[c.id]) : "");
    setError(undefined);
  }

  function reset(v: boolean) {
    setOpen(v);
    if (!v) {
      setQuery("");
      setResults([]);
      setCoin(null);
      setQuantity("");
      setError(undefined);
      setSearchError(undefined);
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!coin) return;
    start(async () => {
      const r = await addHoldingAction(coin.id, quantity);
      if (r.ok) {
        toast.success(owned[coin.id] ? `${coin.name} atualizado` : `${coin.name} adicionado`);
        reset(false);
      } else setError(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button>Adicionar ativo</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar ativo</DialogTitle>
          <DialogDescription>Moedas negociadas na Binance contra USDT. Busque pelo símbolo ou nome.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="coin-search">Moeda</Label>
            <Input
              id="coin-search"
              placeholder="Ex.: BTC, Solana, LINK"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
            {searchError && <p className="text-sm text-destructive">{searchError}</p>}
            {visible.length > 0 && (
              <ul role="listbox" aria-label="Resultados" className="max-h-56 overflow-auto rounded-lg border">
                {visible.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={coin?.id === c.id}
                      onClick={() => choose(c)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                        coin?.id === c.id && "bg-muted",
                      )}
                    >
                      <span className="font-medium">{c.symbol}</span>
                      {c.name !== c.symbol && <span className="text-muted-foreground">{c.name}</span>}
                      {owned[c.id] && <span className="ml-auto text-xs text-muted-foreground">na carteira</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {coin && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="coin-qty">Quantidade de {coin.symbol}</Label>
              <Input
                id="coin-qty"
                inputMode="decimal"
                placeholder="0,5"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                aria-invalid={!!error}
                autoFocus
              />
              {owned[coin.id] && (
                <p className="text-xs text-muted-foreground">
                  Você já tem {formatQty(owned[coin.id])}. Salvar substitui a quantidade.
                </p>
              )}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={!coin || pending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
