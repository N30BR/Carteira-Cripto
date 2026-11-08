import { AuthShell } from "@/components/auth-shell";
import { VerifyPanel } from "./verify-panel";

export const metadata = { title: "Confirmar e-mail · BlackHole Dashboard" };

export default function VerifyEmailPage() {
  return (
    <AuthShell>
      <VerifyPanel />
    </AuthShell>
  );
}
