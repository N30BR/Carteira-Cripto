import { requireUser } from "@/lib/auth/current";
import { AppHeader } from "@/components/app-header";

// Só visual: cada página e cada action chama requireUser/requireAdmin por conta própria.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
