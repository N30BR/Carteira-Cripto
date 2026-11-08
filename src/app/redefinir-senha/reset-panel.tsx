"use client";

// Redefinir senha pelo link do e-mail. O token fica no fragmento (#): é lido aqui, guardado só na memória da página e
// apagado do endereço na hora (não fica no histórico nem é enviado a outros sites).
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authLinkClass } from "@/components/auth-shell";
import { safeAction } from "@/lib/safe-action";
import { cn } from "@/lib/utils";
import { checkResetTokenAction, resetPasswordAction } from "./actions";

type State = "checking" | "invalid" | "form" | "done";

export function ResetPanel() {
  const token = useRef("");
  const [state, setState] = useState<State>("checking");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [pending, start] = useTransition();

  const started = useRef(false);
  useEffect(() => {
    // Lê o token uma única vez (no modo estrito do React o efeito roda duas vezes; a 2ª leria o endereço já limpo).
    if (started.current) return;
    started.current = true;
    token.current = window.location.hash.slice(1);
    // Tira o token do endereço (histórico, capturas de tela, compartilhamento por engano).
    window.history.replaceState(null, "", window.location.pathname);
    void (async () => {
      const ok = token.current ? await checkResetTokenAction(token.current).catch(() => false) : false;
      setState(ok ? "form" : "invalid");
    })();
  }, []);

  // Validação na tela (o servidor confere de novo).
  const tooShort = pw.length > 0 && pw.length < 8;
  const mismatch = pw2.length > 0 && pw !== pw2;
  const valid = pw.length >= 8 && pw.length <= 256 && pw === pw2;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    start(async () => {
      const r = await safeAction(() => resetPasswordAction(token.current, pw, pw2));
      if (r.ok) {
        token.current = "";
        setPw("");
        setPw2("");
        setMessage("message" in r ? r.message : undefined);
        setState("done");
      } else if (/inválido|expirou|usado/.test(r.error)) setState("invalid");
      else setError(r.error);
    });
  };

  if (state === "checking")
    return (
      <CardHeader>
        <CardTitle>Redefinir senha</CardTitle>
        <CardDescription>Conferindo o link...</CardDescription>
      </CardHeader>
    );

  if (state === "invalid")
    return (
      <>
        <CardHeader>
          <CardTitle>Redefinir senha</CardTitle>
          <CardDescription>Este link é inválido, expirou ou já foi usado.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild size="lg">
            <Link href="/login?recuperar=1">Solicitar novo link</Link>
          </Button>
          <Link href="/login" className={authLinkClass}>
            Voltar ao login
          </Link>
        </CardContent>
      </>
    );

  if (state === "done")
    return (
      <>
        <CardHeader>
          <CardTitle>Redefinir senha</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p role="status" className="text-sm text-muted-foreground">
            {message ?? "Senha alterada com sucesso. Entre novamente utilizando sua nova senha."}
          </p>
          <Button asChild size="lg">
            <Link href="/login">Voltar ao login</Link>
          </Button>
        </CardContent>
      </>
    );

  const Toggle = (
    <button
      type="button"
      onClick={() => setShow((s) => !s)}
      aria-label={show ? "Ocultar senha" : "Mostrar senha"}
      aria-pressed={show}
      className="absolute inset-y-0 right-0 grid w-9 place-items-center text-muted-foreground hover:text-foreground [&_svg]:size-4"
    >
      {show ? <EyeOff /> : <Eye />}
    </button>
  );

  return (
    <>
      <CardHeader>
        <CardTitle>Redefinir senha</CardTitle>
        <CardDescription>Escolha uma senha nova (mínimo de 8 caracteres).</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">Senha nova</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                aria-invalid={tooShort}
                className="pr-9"
                required
                autoFocus
              />
              {Toggle}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="repeat-password">Repetir senha</Label>
            <div className="relative">
              <Input
                id="repeat-password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                aria-invalid={mismatch}
                className="pr-9"
                required
              />
              {Toggle}
            </div>
          </div>
          <p role="alert" aria-live="polite" className={cn("min-h-5 text-sm text-destructive")}>
            {error ?? (tooShort ? "A senha precisa ter pelo menos 8 caracteres." : mismatch ? "As senhas não são iguais." : "")}
          </p>
          <Button type="submit" size="lg" disabled={pending || !valid}>
            {pending ? "Alterando..." : "Alterar senha"}
          </Button>
        </form>
      </CardContent>
    </>
  );
}
