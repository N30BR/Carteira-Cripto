import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/current";
import { ensureDefaultAccounts, listCardAccounts } from "@/lib/cards/accounts";
import { ensureDefaultCategories, listCategories } from "@/lib/cards/categories";
import { parseMonth } from "@/lib/cards/months";
import { listInstallments } from "@/lib/cards/store";
import { monthRange } from "@/lib/transactions/period";
import { listTransactions } from "@/lib/transactions/store";
import { appTimeZone, todayIn } from "@/lib/validation";
import { PageTitle } from "@/components/finance/ui";
import { LaunchesView } from "./view";

export const metadata = { title: "Lançamentos · Carteira Cripto" };

export default async function LaunchesPage({ searchParams }: PageProps<"/lancamentos">) {
  const user = await requireUser();
  const db = getDb();
  const today = todayIn(appTimeZone());
  const month = parseMonth((await searchParams).mes) ?? today.slice(0, 7);

  ensureDefaultCategories(db, user.id);
  ensureDefaultAccounts(db, user.id);
  const [from, to] = monthRange(month);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Lançamentos" subtitle="Registre faturas e transações financeiras, com controle por categorias e cartões." />
      <LaunchesView
        key={month}
        month={month}
        today={today}
        rows={listInstallments(db, user.id, month, month)}
        categories={listCategories(db, user.id)}
        accounts={listCardAccounts(db, user.id)}
        transactions={listTransactions(db, user.id, from, to)}
      />
    </div>
  );
}
