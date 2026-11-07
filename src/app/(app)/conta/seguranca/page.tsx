import { getDb } from "@/db/client";
import { getSessionState, requireUser } from "@/lib/auth/current";
import { totpStatus } from "@/lib/auth/totp";
import { SecurityForm } from "./security-form";

export const metadata = { title: "Segurança · BlackHole Dashboard" };

export default async function SecurityPage() {
  const user = await requireUser();
  const session = await getSessionState();
  const status = totpStatus(getDb(), user.id);
  return <SecurityForm lockMinutes={session?.lockMinutes ?? 10} totpEnabled={status.enabled} />;
}
