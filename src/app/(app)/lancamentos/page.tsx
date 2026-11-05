import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/current";
import { ensureDefaultCategories, listCategories } from "@/lib/cards/categories";
import { parseMonth } from "@/lib/cards/months";
import { listInstallments } from "@/lib/cards/store";
import { appTimeZone, todayIn } from "@/lib/validation";
import { MonthPicker } from "@/components/month-picker";
import { LaunchesView } from "./view";

export const metadata = { title: "Lançamentos · Carteira Cripto" };

export default async function LaunchesPage({ searchParams }: PageProps<"/lancamentos">) {
  const user = await requireUser();
  const db = getDb();
  const today = todayIn(appTimeZone());
  const month = parseMonth((await searchParams).mes) ?? today.slice(0, 7);

  ensureDefaultCategories(db, user.id);
  const categories = listCategories(db, user.id);
  const rows = listInstallments(db, user.id, month, month);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Lançamento de Custos</h1>
          <p className="text-sm text-muted-foreground">
            Insira, edite e acompanhe os custos do mês, diferenciando PF e PJ, cartões e parcelas.
          </p>
        </div>
        <MonthPicker month={month} />
      </div>
      <LaunchesView key={month} month={month} today={today} rows={rows} categories={categories} />
    </div>
  );
}
