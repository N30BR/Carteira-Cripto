"use client";

// Conteúdo do cartão de acesso: "Entrar" ou "Recuperar senha" (mesmo cartão, só troca os campos e as ações).
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authLinkClass } from "@/components/auth-shell";
import { safeAction } from "@/lib/safe-action";
import { LoginForm } from "./login-form";
import { requestResetAction } from "./actions";

export function LoginPanel({ startInRecover = false }: { startInRecover?: boolean }) {
  const [mode, setMode] = useState<"login" | "recover">(startInRecover ? "recover" : "login");
  if (mode === "recover") return <RecoverForm onBack={() => setMode("login")} />;
  return (
    <>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>Acesse o dashboard da sua carteira.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <LoginForm />
        <button type="button" onClick={() => setMode("recover")} className={authLinkClass}>
          Esqueceu a senha
        </button>
      </CardContent>
    </>
  );
}

function RecoverForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await safeAction(() => requestResetAction(email));
      if (r.ok && "message" in r) {
        setMessage(r.message);
        setError(undefined);
      } else if (!r.ok) setError(r.error);
    });
  };
  return (
    <>
      <CardHeader>
        <CardTitle>Recuperar senha</CardTitle>
        <CardDescription>Informe o e-mail de recuperação cadastrado na sua conta.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {message ? (
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="recover-email">Email</Label>
              <Input id="recover-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <p role="alert" aria-live="polite" className="min-h-5 text-sm text-destructive">
              {error}
            </p>
            <Button type="submit" size="lg" disabled={pending || !email.trim()}>
              {pending ? "Enviando..." : "Enviar link de recuperação"}
            </Button>
          </form>
        )}
        <button type="button" onClick={onBack} className={authLinkClass}>
          Voltar ao login
        </button>
      </CardContent>
    </>
  );
}
