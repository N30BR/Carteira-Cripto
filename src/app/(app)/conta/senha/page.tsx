import { requireUser } from "@/lib/auth/current";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Trocar senha · BlackHole Dashboard" };

export default async function ChangePasswordPage() {
  await requireUser();
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Trocar senha</CardTitle>
      </CardHeader>
      <CardContent>
        <PasswordForm />
      </CardContent>
    </Card>
  );
}
