import { getModuleState } from "@/lib/auth/modules";
import { getSessionState } from "@/lib/auth/current";
import { LockGuard } from "@/components/lock-guard";
import { AppHeader } from "@/components/app-header";
import { SpaceBackdrop } from "@/components/space-backdrop";
import { ConfirmHost } from "@/components/confirm-dialog";
import "./space.css";

// Só visual: cada página e cada action chama requireUser/requireAdmin por conta própria.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, disabled } = await getModuleState();
  const session = await getSessionState();
  return (
    <>
      {/* Bloqueio por inatividade (o servidor também exige o desbloqueio). */}
      <LockGuard lockMinutes={session?.lockMinutes ?? 10} username={user.username} />
      <SpaceBackdrop />
      <AppHeader user={user} disabled={disabled} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      {/* Confirmações do dashboard (no lugar do confirm() do navegador). */}
      <ConfirmHost />
    </>
  );
}
