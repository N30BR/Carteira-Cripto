"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});
  // Campos controlados: se a conta pedir o código de verificação, usuário e senha continuam preenchidos.
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">Usuário</Label>
        <Input id="username" name="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Senha</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {state.needCode && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">Código de verificação</Label>
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" placeholder="6 dígitos do aplicativo" required autoFocus />
          <p className="text-xs text-muted-foreground">Esta conta usa verificação em duas etapas: digite o código do aplicativo autenticador.</p>
        </div>
      )}
      <p role="alert" aria-live="polite" className="min-h-5 text-sm text-destructive">
        {state.error}
      </p>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
