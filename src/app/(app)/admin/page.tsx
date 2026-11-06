import { getDb } from "@/db/client";
import { requireAdmin } from "@/lib/auth/current";
import { isLocked } from "@/lib/auth/login";
import { listUsers } from "@/lib/admin/users";
import { appTimeZone } from "@/lib/validation";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteUserButton, NewUserDialog, ResetPasswordDialog, UnlockButton } from "./user-dialogs";

export const metadata = { title: "Admin · BlackHole Dashboard" };

const TZ = appTimeZone();
const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: TZ });
const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

export default async function AdminPage() {
  await requireAdmin();
  const now = new Date();
  const users = listUsers(getDb());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Usuários</h1>
        <NewUserDialog />
      </div>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const locked = isLocked(u.lockedUntil, now);
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.username}</TableCell>
                  <TableCell>{u.isAdmin ? "Sim" : "Não"}</TableCell>
                  <TableCell>{date.format(u.createdAt)}</TableCell>
                  <TableCell>
                    {locked ? (
                      <Badge variant="destructive">Bloqueado até {time.format(u.lockedUntil!)}</Badge>
                    ) : (
                      <Badge variant="secondary">Ativo</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {locked && <UnlockButton userId={u.id} />}
                      <ResetPasswordDialog userId={u.id} username={u.username} />
                      <DeleteUserButton userId={u.id} username={u.username} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
