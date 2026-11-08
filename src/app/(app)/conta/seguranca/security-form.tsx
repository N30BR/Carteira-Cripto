"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, ShieldCheck, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LOCK_OPTIONS } from "@/lib/auth/lock-config";
import { safeAction } from "@/lib/safe-action";
import { confirmTotpAction, disableTotpAction, requestEmailAction, setLockMinutesAction, startTotpAction } from "./actions";
import type { EmailStatus } from "@/lib/auth/recovery";

export function SecurityForm({ lockMinutes, totpEnabled, email }: { lockMinutes: number; totpEnabled: boolean; email: EmailStatus }) {
  const emailOk = email.state === "verified";
  const router = useRouter();
  const [pending, start] = useTransition();
  const [minutes, setMinutes] = useState(lockMinutes);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();

  const saveMinutes = (m: number) => {
    setMinutes(m);
    start(async () => {
      const r = await safeAction(() => setLockMinutesAction(m));
      if (r.ok) {
        toast.success(m === 0 ? "Bloqueio por inatividade desativado" : `Bloqueio após ${m} ${m === 1 ? "minuto" : "minutos"} sem uso`);
        // Atualiza o tempo usado pela tela.
        router.refresh();
      } else toast.error(r.error);
    });
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="size-5 text-[#a888c0]" /> Bloqueio por inatividade
          </CardTitle>
          <CardDescription>
            Sem interação (mouse, teclado, rolagem ou toque) por esse tempo, a sessão é bloqueada e só volta com a senha. O servidor também confere: nenhum dado é entregue
            enquanto estiver bloqueada. Atualizações automáticas de gráficos não contam como uso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Label htmlFor="lock-minutes" className="mb-2 block">
            Tempo de inatividade
          </Label>
          <select
            id="lock-minutes"
            value={minutes}
            disabled={pending}
            onChange={(e) => saveMinutes(Number(e.target.value))}
            className="h-9 w-56 rounded-md border bg-background px-2 text-sm"
          >
            {LOCK_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? "Desativado" : `${m} ${m === 1 ? "minuto" : "minutos"}${m === 10 ? " (recomendado)" : ""}`}
              </option>
            ))}
          </select>
          {minutes === 0 && (
            <p className="mt-2 text-xs text-amber-400/90">
              Desativado: a sessão não é bloqueada por falta de uso. Ela continua terminando ao clicar em Sair e após 7 dias. Em computadores
              compartilhados, prefira deixar ligado.
            </p>
          )}
        </CardContent>
      </Card>

      <EmailCard email={email} totpEnabled={totpEnabled} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-[#a888c0]" /> Verificação em duas etapas
          </CardTitle>
          <CardDescription>
            Opcional. Ao entrar, além da senha, pede um código de 6 dígitos de um aplicativo autenticador (Google Authenticator, Authy, 1Password, Bitwarden...).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {totpEnabled ? (
            <>
              <p className="font-medium text-green-500">Ativa nesta conta.</p>
              <p className="text-muted-foreground">Para desligar, confirme a senha e um código atual do aplicativo.</p>
              {!emailOk && <p className="text-xs text-amber-400/90">Cadastre e confirme seu e-mail antes de alterar a autenticação de dois fatores (o acesso continua normal).</p>}
              <Input type="password" aria-label="Senha" placeholder="Senha" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <Input aria-label="Código do aplicativo" placeholder="Código de 6 dígitos" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} />
              {error && <p className="text-destructive">{error}</p>}
              <Button
                variant="outline"
                disabled={pending || !password || !code}
                onClick={() =>
                  start(async () => {
                    const r = await safeAction(() => disableTotpAction(password, code));
                    setPassword("");
                    setCode("");
                    if (r.ok) {
                      toast.success("Verificação em duas etapas desligada");
                      setError(undefined);
                      router.refresh();
                    } else setError(r.error);
                  })
                }
              >
                Desligar verificação em duas etapas
              </Button>
            </>
          ) : setup ? (
            <>
              <p>1. No aplicativo autenticador, adicione uma conta digitando a chave abaixo (ou colando o endereço, se o app aceitar):</p>
              <code className="rounded-md border bg-muted/40 px-2 py-1.5 font-mono text-sm tracking-widest break-all select-all">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Endereço otpauth://</summary>
                <code className="break-all select-all">{setup.uri}</code>
              </details>
              <p>2. Digite o código de 6 dígitos que o aplicativo mostra para confirmar:</p>
              <Input aria-label="Código de confirmação" placeholder="000000" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
              {error && <p className="text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button
                  disabled={pending || !code}
                  onClick={() =>
                    start(async () => {
                      const r = await safeAction(() => confirmTotpAction(code));
                      setCode("");
                      if (r.ok) {
                        toast.success("Verificação em duas etapas ativada");
                        setSetup(null);
                        setError(undefined);
                        router.refresh();
                      } else setError(r.error);
                    })
                  }
                >
                  Confirmar e ativar
                </Button>
                <Button variant="ghost" onClick={() => setSetup(null)}>
                  Cancelar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Guarde a chave num lugar seguro: sem o aplicativo, só um administrador consegue redefinir o acesso.</p>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">Desligada.</p>
              {!emailOk && <p className="text-xs text-muted-foreground">Cadastre e confirme seu e-mail para habilitar a autenticação de dois fatores.</p>}
              <Button
                variant="outline"
                className="self-start"
                disabled={pending || !emailOk}
                onClick={() =>
                  start(async () => {
                    const r = await safeAction(() => startTotpAction());
                    if (r.ok && "secret" in r) {
                      setSetup({ secret: r.secret, uri: r.uri });
                      setError(undefined);
                    } else if (!r.ok) toast.error(r.error);
                  })
                }
              >
                Ativar verificação em duas etapas
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const STATE_LABEL: Record<EmailStatus["state"], { text: string; cls: string }> = {
  none: { text: "Não cadastrado", cls: "text-muted-foreground" },
  pending: { text: "Pendente de verificação", cls: "text-amber-400" },
  verified: { text: "Verificado", cls: "text-green-500" },
};

/** E-mail de recuperação: cadastrar ou trocar exige a senha (e o código, com 2FA ativo); só vale depois de confirmado. */
function EmailCard({ email, totpEnabled }: { email: EmailStatus; totpEnabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const st = STATE_LABEL[email.state];
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await safeAction(() => requestEmailAction(value, password, code));
      setPassword("");
      setCode("");
      if (r.ok) {
        setMessage("message" in r ? r.message : undefined);
        setError(undefined);
        setEditing(false);
        setValue("");
        router.refresh();
      } else setError(r.error);
    });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-5 text-[#a888c0]" /> E-mail de recuperação
        </CardTitle>
        <CardDescription>Usado só para redefinir a senha e para avisos de segurança. Precisa ser confirmado pelo link enviado a ele.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p>
          Situação: <span className={st.cls + " font-medium"}>{st.text}</span>
          {email.email && <span className="ml-2 text-muted-foreground">{email.email}</span>}
        </p>
        {email.pending && (
          <p className="text-xs text-muted-foreground">
            Aguardando confirmação de <span className="text-foreground">{email.pending}</span> (link válido por 24 horas).
            {email.state === "verified" && " O e-mail atual continua valendo até lá."}
          </p>
        )}
        {message && (
          <p role="status" className="text-xs text-green-500">
            {message}
          </p>
        )}
        {!email.mailReady && <p className="text-xs text-amber-400/90">O envio de e-mails ainda não está configurado no servidor (SMTP).</p>}
        {editing ? (
          <form onSubmit={submit} className="flex flex-col gap-2">
            <Input type="email" aria-label="Novo e-mail de recuperação" placeholder="seu@email.com" autoComplete="email" value={value} onChange={(e) => setValue(e.target.value)} required />
            <Input type="password" aria-label="Senha atual" placeholder="Senha atual (confirmação)" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {totpEnabled && (
              <Input aria-label="Código do aplicativo" placeholder="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required />
            )}
            {error && <p className="text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending || !value.trim() || !password}>
                {pending ? "Enviando..." : "Enviar link de confirmação"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => (setEditing(false), setError(undefined))}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" className="self-start" disabled={!email.mailReady} onClick={() => (setEditing(true), setMessage(undefined))}>
            {email.state === "none" ? "Cadastrar e-mail" : "Alterar e-mail"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
