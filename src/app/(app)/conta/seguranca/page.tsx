import { getDb } from "@/db/client";
import { getSessionState, requireUser } from "@/lib/auth/current";
import { totpStatus } from "@/lib/auth/totp";
import { emailStatus } from "@/lib/auth/recovery";
import { SecurityForm } from "./security-form";

export const metadata = { title: "Segurança · BlackHole Dashboard" };

export default async function SecurityPage() {
  const user = await requireUser();
  const session = await getSessionState();
  const status = totpStatus(getDb(), user.id);
  return <SecurityForm lockMinutes={session?.lockMinutes ?? 10} totpEnabled={status.enabled} email={emailStatus(getDb(), user.id)} />;
}
