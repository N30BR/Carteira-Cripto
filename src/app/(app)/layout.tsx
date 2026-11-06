import { getModuleState } from "@/lib/auth/modules";
import { AppHeader } from "@/components/app-header";

// Só visual: cada página e cada action chama requireUser/requireAdmin por conta própria.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, disabled } = await getModuleState();
  return (
    <>
      <AppHeader user={user} disabled={disabled} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
