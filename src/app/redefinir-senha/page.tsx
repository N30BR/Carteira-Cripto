import { AuthShell } from "@/components/auth-shell";
import { ResetPanel } from "./reset-panel";

export const metadata = { title: "Redefinir senha · BlackHole Dashboard" };

/** Link de redefinição: o token vem no fragmento (#) e só o navegador o lê (não chega a logs nem ao Referer). */
export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <ResetPanel />
    </AuthShell>
  );
}
