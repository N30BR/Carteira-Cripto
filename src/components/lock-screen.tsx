"use client";

// Tela de bloqueio por inatividade (identidade do BlackHole). O desbloqueio confere a senha no servidor.
import { useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";
import { logoutAction } from "@/app/(app)/actions";
import { unlockAction } from "@/app/bloqueio/actions";
import { safeAction } from "@/lib/safe-action";

export function LockScreen({ username, onUnlocked }: { username?: string; onUnlocked: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await safeAction(() => unlockAction(password));
      setPassword("");
      if (r.ok) return onUnlocked();
      if ("expired" in r && r.expired) {
        // Sessão encerrada: recarga completa (tira da memória da página os dados privados).
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/login";
        return;
      }
      setError(r.error);
    });
  };
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 px-4">
      <Logo />
      <div className="w-full rounded-2xl border border-[#8b5cf6]/35 bg-[#0b0712]/90 p-6 shadow-[0_0_48px_-12px_rgba(139,92,246,0.55)]">
        <p className="mb-1 flex items-center gap-2 text-lg font-semibold">
          <Lock className="size-5 text-[#a888c0]" aria-hidden /> Sessão bloqueada por inatividade.
        </p>
        <p className="mb-4 text-sm text-muted-foreground">
          {username ? (
            <>
              Digite a senha de <span className="font-medium text-foreground">{username}</span> para continuar de onde parou.
            </>
          ) : (
            "Digite sua senha para continuar de onde parou."
          )}
        </p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="unlock-password">Senha</Label>
            <Input id="unlock-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
          </div>
          <p role="alert" aria-live="polite" className="min-h-5 text-sm text-destructive">
            {error}
          </p>
          <Button type="submit" size="lg" disabled={pending || !password}>
            {pending ? "Conferindo..." : "Desbloquear"}
          </Button>
          <button type="button" onClick={() => logoutAction()} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            Sair e entrar com outra conta
          </button>
        </form>
      </div>
    </div>
  );
}
