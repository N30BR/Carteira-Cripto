import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/current";
import { ensureDefaultAccounts, listCardAccounts } from "@/lib/cards/accounts";
import { ensureDefaultCategories, listCategories } from "@/lib/cards/categories";
import { parseMonth } from "@/lib/cards/months";
import { listInstallments } from "@/lib/cards/store";
import { openPurchases } from "@/lib/cards/summary";
import { monthRange } from "@/lib/transactions/period";
import { listTransactions } from "@/lib/transactions/store";
import { appTimeZone, todayIn } from "@/lib/validation";
import { PageTitle } from "@/components/finance/ui";
import { LaunchesView } from "./view";

export const metadata = { title: "Lançamentos · BlackHole Dashboard" };

export default async function LaunchesPage({ searchParams }: PageProps<"/lancamentos">) {
  const user = await requireUser();
  const db = getDb();
  const today = todayIn(appTimeZone());
  const month = parseMonth((await searchParams).mes) ?? today.slice(0, 7);

  ensureDefaultCategories(db, user.id);
  ensureDefaultAccounts(db, user.id);
  const [from, to] = monthRange(month);
  // O que falta pagar de cada compra até a última parcela (inclusive parcelas de meses anteriores não pagas).
  const open = openPurchases(listInstallments(db, user.id, "2000-01", "2099-12", { unpaidOnly: true }), month);

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
        open={Object.fromEntries(open.map((o) => [o.expenseId, { remainingCount: o.remainingCount, remainingCents: o.remainingCents }]))}
        overdue={open.reduce(
          (t, o) => ({ count: t.count + o.overdueCount, cents: t.cents + o.overdueCents }),
          { count: 0, cents: 0 },
        )}
      />
    </div>
  );
}
