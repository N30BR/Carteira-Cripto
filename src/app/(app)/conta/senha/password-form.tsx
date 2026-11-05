"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { changePasswordAction, type PasswordState } from "./actions";

const FIELDS = [
  { id: "current", label: "Senha atual", auto: "current-password" },
  { id: "next", label: "Nova senha", auto: "new-password" },
  { id: "confirm", label: "Confirmar nova senha", auto: "new-password" },
];

export function PasswordForm() {
  const [state, formAction, pending] = useActionState<PasswordState, FormData>(changePasswordAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {FIELDS.map((f) => (
        <div key={f.id} className="flex flex-col gap-2">
          <Label htmlFor={f.id}>{f.label}</Label>
          <Input id={f.id} name={f.id} type="password" autoComplete={f.auto} required />
        </div>
      ))}
      <p role="alert" aria-live="polite" className={cn("min-h-5 text-sm", state.ok ? "text-emerald-500" : "text-destructive")}>
        {state.ok ? "Senha alterada. As outras sessões foram encerradas." : state.error}
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}
