import { redirect } from "next/navigation";
import { getSessionState } from "@/lib/auth/current";
import { UnlockPage } from "./unlock-page";

export const metadata = { title: "Sessão bloqueada · BlackHole Dashboard" };

/** Sessão bloqueada por inatividade (o servidor não entrega nenhuma página privada até desbloquear). */
export default async function LockedPage() {
  const s = await getSessionState();
  if (!s) redirect("/login");
  if (!s.locked) redirect("/");
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-black py-10">
      <UnlockPage username={s.user.username} />
    </main>
  );
}
