"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { Result } from "@/lib/admin/users";
import { safeAction } from "@/lib/safe-action";
import { createUserAction, deleteUserAction, resetPasswordAction, unlockUserAction } from "./actions";
import { confirmAction } from "@/components/confirm-dialog";

function useResultForm(action: (fd: FormData) => Promise<Result>, success: string) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  // onSubmit (e não action) para o React não limpar os campos quando dá erro.
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await safeAction(() => action(fd));
      if (r.ok) {
        setOpen(false);
        setError(undefined);
        toast.success(success);
      } else setError(r.error);
    });
  };
  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) setError(undefined);
  };
  return { open, onOpenChange, error, pending, onSubmit };
}

export function NewUserDialog() {
  const f = useResultForm(createUserAction, "Usuário criado");
  return (
    <Dialog open={f.open} onOpenChange={f.onOpenChange}>
      <DialogTrigger asChild>
        <Button>Novo usuário</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>A pessoa entra com este usuário e senha.</DialogDescription>
        </DialogHeader>
        <form onSubmit={f.onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-username">Usuário</Label>
            <Input id="new-username" name="username" required autoComplete="off" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">Senha</Label>
            <Input id="new-password" name="password" type="password" required autoComplete="new-password" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="isAdmin" /> Administrador
          </label>
          {f.error && <p role="alert" className="text-sm text-destructive">{f.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={f.pending}>Criar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ResetPasswordDialog({ userId, username }: { userId: number; username: string }) {
  const f = useResultForm((fd) => resetPasswordAction(userId, fd), "Senha redefinida");
  return (
    <Dialog open={f.open} onOpenChange={f.onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Redefinir senha</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redefinir senha de {username}</DialogTitle>
          <DialogDescription>A conta é desbloqueada e todas as sessões dela são encerradas.</DialogDescription>
        </DialogHeader>
        <form onSubmit={f.onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`reset-${userId}`}>Nova senha</Label>
            <Input id={`reset-${userId}`} name="password" type="password" required autoComplete="new-password" />
          </div>
          {f.error && <p role="alert" className="text-sm text-destructive">{f.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={f.pending}>Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UnlockButton({ userId }: { userId: number }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await safeAction(() => unlockUserAction(userId));
          if (r.ok) toast.success("Conta desbloqueada");
          else toast.error(r.error);
        })
      }
    >
      Desbloquear
    </Button>
  );
}

export function DeleteUserButton({ userId, username }: { userId: number; username: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="destructive"
      size="sm"
      disabled={pending}
      onClick={async () => {
        if (!(await confirmAction({ title: "Remover usuário?", message: `Remover ${username}? A carteira dessa pessoa também será apagada.`, confirmLabel: "Remover" }))) return;
        start(async () => {
          const r = await safeAction(() => deleteUserAction(userId));
          if (r.ok) toast.success("Usuário removido");
          else toast.error(r.error);
        });
      }}
    >
      Remover
    </Button>
  );
}
