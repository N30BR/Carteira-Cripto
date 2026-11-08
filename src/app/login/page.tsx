import { redirect } from "next/navigation";
import { getSessionState } from "@/lib/auth/current";
import { AuthShell } from "@/components/auth-shell";
import { LoginPanel } from "./login-panel";

export const metadata = { title: "Entrar · BlackHole Dashboard" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ recuperar?: string }> }) {
  const session = await getSessionState();
  // Já entrou: vai para o app (ou para o desbloqueio, se a sessão estiver bloqueada por inatividade).
  if (session) redirect(session.locked ? "/bloqueio" : "/");
  // "?recuperar=1": abre direto em "Recuperar senha" (link vindo de um link de redefinição expirado).
  const recover = (await searchParams).recuperar === "1";
  return (
    <AuthShell>
      <LoginPanel startInRecover={recover} />
    </AuthShell>
  );
}
