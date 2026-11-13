"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ConfirmOptions = {
  title: string;
  message: React.ReactNode;
  /** Texto do botão de confirmar (ex.: "Fechar gráfico"). */
  confirmLabel: string;
  cancelLabel?: string;
  /** Ação destrutiva: botão de confirmar em vermelho discreto. Padrão: true. */
  destructive?: boolean;
  /** Palavra que a pessoa precisa digitar para liberar o botão (ex.: "EXCLUIR"). */
  typeToConfirm?: string;
};

/**
 * Janela de confirmação do dashboard (no lugar do confirm() do navegador): centralizada, com o fundo escurecido,
 * foco preso dentro dela (Radix), Esc/Cancelar fecham sem fazer nada e o foco volta ao botão que a abriu.
 * `onConfirm` pode ser assíncrono: a janela mostra "carregando", trava os botões e só fecha quando ele termina
 * com sucesso (retornar false ou lançar erro mantém a janela aberta).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancelar",
  destructive = true,
  typeToConfirm,
}: ConfirmOptions & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | boolean | Promise<void | boolean>;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cada abertura começa limpa.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTyped("");
      setError(null);
    }
  }
  const ready = !typeToConfirm || typed.trim() === typeToConfirm;

  async function confirm() {
    if (!ready || busy) return; // um clique só
    setBusy(true);
    setError(null);
    try {
      const ok = await onConfirm();
      if (ok !== false) onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Não foi possível concluir. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent
        showCloseButton={false}
        className="gap-5 border border-border/60 bg-[#0f0f14] p-6 shadow-2xl sm:max-w-md"
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onPointerDownOutside={(e) => busy && e.preventDefault()}
      >
        <div className="flex gap-3">
          {destructive && (
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-400">
              <AlertTriangle className="size-4.5" />
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-1.5">
            <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm leading-relaxed text-muted-foreground">{message}</div>
            </DialogDescription>
          </div>
        </div>
        {typeToConfirm && (
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            <span>
              Para confirmar, digite <strong className="font-semibold text-foreground">{typeToConfirm}</strong>
            </span>
            <Input
              value={typed}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              aria-label={`Digite ${typeToConfirm} para confirmar`}
              disabled={busy}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirm()}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)} autoFocus={!typeToConfirm}>
            {cancelLabel}
          </Button>
          <Button
            disabled={!ready || busy}
            onClick={confirm}
            className={cn(destructive && "border border-red-500/40 bg-red-500/15 text-red-300 hover:bg-red-500/25 focus-visible:ring-red-500/40")}
          >
            {busy && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Uso direto: `if (await confirmAction({...})) fazAlgo()` ----------

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };
let current: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/**
 * Pede confirmação na janela do dashboard e devolve true/false. Uma de cada vez: se já houver uma aberta,
 * a nova é recusada (false), evitando confirmações simultâneas.
 */
export function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  if (current) return Promise.resolve(false);
  return new Promise((resolve) => {
    current = { ...opts, resolve };
    emit();
  });
}

function finish(ok: boolean) {
  const p = current;
  current = null;
  emit();
  p?.resolve(ok);
}

/** Montado uma vez no layout: mostra as confirmações pedidas por confirmAction(). */
export function ConfirmHost() {
  const pending = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
  // Ao sair da página com uma confirmação aberta, ela é cancelada.
  useEffect(() => () => current?.resolve(false), []);
  // Fecha na hora (sem animação de saída): enquanto ela sumia, o Esc e os cliques ainda iam para ela e não para a
  // janela de baixo (ex.: "Cartões / contas" dentro de "Nova Fatura").
  const o = pending;
  if (!o) return null;
  return (
    <ConfirmDialog
      open
      onOpenChange={(v) => !v && pending && finish(false)}
      onConfirm={() => {
        finish(true);
        return false; // finish já fechou
      }}
      title={o?.title ?? ""}
      message={o?.message ?? ""}
      confirmLabel={o?.confirmLabel ?? "Confirmar"}
      cancelLabel={o?.cancelLabel}
      destructive={o?.destructive}
      typeToConfirm={o?.typeToConfirm}
    />
  );
}
