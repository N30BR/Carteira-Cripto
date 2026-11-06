import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/current";
import { ensureDefaultGroups, listEvents, listGroups, listQuickNotes, listTasks } from "@/lib/todos/store";
import { appTimeZone, todayIn } from "@/lib/validation";
import { TodosView } from "./view";

export const metadata = { title: "Pendências · BlackHole Dashboard" };

export default async function TodosPage() {
  const user = await requireUser();
  const db = getDb();
  ensureDefaultGroups(db, user.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Pendências</h1>
        <p className="text-sm text-muted-foreground">Organize tarefas, projetos, notas e micro checklists por categoria e prioridade.</p>
      </div>
      <TodosView
        today={todayIn(appTimeZone())}
        tasks={listTasks(db, user.id)}
        groups={listGroups(db, user.id)}
        events={listEvents(db, user.id)}
        quickNotes={listQuickNotes(db, user.id)}
      />
    </div>
  );
}
