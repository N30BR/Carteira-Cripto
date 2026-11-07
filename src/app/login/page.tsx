import { redirect } from "next/navigation";
import { getSessionState } from "@/lib/auth/current";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar · BlackHole Dashboard" };

export default async function LoginPage() {
  const session = await getSessionState();
  // Já entrou: vai para o app (ou para o desbloqueio, se a sessão estiver bloqueada por inatividade).
  if (session) redirect(session.locked ? "/bloqueio" : "/");
  return (
    <main className="relative isolate flex flex-1 flex-col items-center bg-black px-4">
      {/* Fundo decorativo (referência login.png, sem a logo e o formulário ilustrados): buraco negro no alto,
          colunas, códigos e anéis. Fixo e cobrindo a tela; no celular corta as laterais e mantém o centro. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- imagem estática já otimizada (WebP) */}
      <img
        src="/login/fundo.webp"
        alt=""
        aria-hidden
        width={1672}
        height={941}
        fetchPriority="high"
        className="pointer-events-none fixed inset-0 -z-10 h-full w-full object-cover object-[50%_35%] select-none"
      />
      {/* Logo logo abaixo do buraco negro e formulário no centro, como na referência. Em telas baixas
          (ou com o teclado do celular aberto) a página rola e nada fica fora de alcance. */}
      <div className="flex w-full max-w-sm flex-col items-center gap-7 pt-[max(2rem,32.6dvh)] pb-10">
        <Logo />
        <Card className="w-full rounded-2xl border border-[#8b5cf6]/35 bg-[#0b0712]/90 shadow-[0_0_48px_-12px_rgba(139,92,246,0.55)] backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Entrar</CardTitle>
            <CardDescription>Acesse o dashboard da sua carteira.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
