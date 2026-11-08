"use client";

// Confirmar o e-mail de recuperação pelo link. O token vem no fragmento (#), é usado uma vez e apagado do endereço.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { verifyEmailAction } from "./actions";

export function VerifyPanel() {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const started = useRef(false);
  useEffect(() => {
    // Uma única vez (no modo estrito do React o efeito roda duas vezes e o token já teria saído do endereço).
    if (started.current) return;
    started.current = true;
    const token = window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname);
    void (async () => {
      const r = token ? await verifyEmailAction(token).catch(() => null) : null;
      setResult(r?.ok ? { ok: true, text: r.message ?? "E-mail confirmado." } : { ok: false, text: r && !r.ok ? r.error : "Link inválido ou expirado." });
    })();
  }, []);
  return (
    <>
      <CardHeader>
        <CardTitle>Confirmar e-mail</CardTitle>
        <CardDescription>{result ? (result.ok ? "Tudo certo." : "Não foi possível confirmar.") : "Confirmando..."}</CardDescription>
      </CardHeader>
      {result && (
        <CardContent className="flex flex-col gap-4">
          <p role="status" className="text-sm text-muted-foreground">
            {result.text}
            {!result.ok && " Peça um novo link na aba Segurança da sua conta."}
          </p>
          <Button asChild size="lg">
            <Link href="/conta/seguranca">Ir para a aba Segurança</Link>
          </Button>
        </CardContent>
      )}
    </>
  );
}
