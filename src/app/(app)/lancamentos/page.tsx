import { getDb } from "@/db/client";
import { getModuleState } from "@/lib/auth/modules";
import { ModulesEmpty } from "@/components/modules-empty";
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
  // Lançamentos fica sempre visível; cada bloco segue o seu módulo (Faturas e Transações).
  const { user, on } = await getModuleState();
  const showInvoices = on("invoices");
  const showTransactions = on("transactions");
  const db = getDb();
  const today = todayIn(appTimeZone());
  const month = parseMonth((await searchParams).mes) ?? today.slice(0, 7);

  ensureDefaultCategories(db, user.id);
  ensureDefaultAccounts(db, user.id);
  const [from, to] = monthRange(month);
  // O que falta pagar de cada compra até a última parcela (inclusive parcelas de meses anteriores não pagas).
  // Seção escondida não carrega nem envia dados ao navegador.
  const open = showInvoices ? openPurchases(listInstallments(db, user.id, "2000-01", "2099-12", { unpaidOnly: true }), month) : [];

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Lançamentos" subtitle="Registre faturas e transações financeiras, com controle por categorias e cartões." />
      {!showInvoices && !showTransactions && <ModulesEmpty what="Os módulos Faturas e Transações" />}
      <LaunchesView
        showInvoices={showInvoices}
        showTransactions={showTransactions}
        key={month}
        month={month}
        today={today}
        rows={showInvoices ? listInstallments(db, user.id, month, month) : []}
        categories={showInvoices ? listCategories(db, user.id) : []}
        accounts={showInvoices ? listCardAccounts(db, user.id) : []}
        transactions={showTransactions ? listTransactions(db, user.id, from, to) : []}
        open={Object.fromEntries(open.map((o) => [o.expenseId, { remainingCount: o.remainingCount, remainingCents: o.remainingCents }]))}
        overdue={open.reduce(
          (t, o) => ({ count: t.count + o.overdueCount, cents: t.cents + o.overdueCents }),
          { count: 0, cents: 0 },
        )}
      />
    </div>
  );
}
