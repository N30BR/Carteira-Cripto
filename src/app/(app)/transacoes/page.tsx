import { ArrowDown, ArrowLeftRight, ArrowUp, Wallet } from "lucide-react";
import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/current";
import { addMonths, monthLabel, parseMonth } from "@/lib/cards/months";
import { monthlyTransactions, transactionShares, transactionTotals } from "@/lib/transactions/calc";
import { monthRange } from "@/lib/transactions/period";
import { listTransactions } from "@/lib/transactions/store";
import { appTimeZone, todayIn } from "@/lib/validation";
import { Card, CardContent } from "@/components/ui/card";
import { TransactionBars, TransactionPie } from "@/components/finance/charts";
import { TransactionsTable } from "@/components/finance/transactions";
import { BLUE, DOWN, PageTitle, SectionTitle, SignedMoney, StatCard, TotalChip, TotalsBar, UP } from "@/components/finance/ui";
import { MonthPicker } from "@/components/month-picker";

export const metadata = { title: "Transações · Carteira Cripto" };

export default async function TransactionsPage({ searchParams }: PageProps<"/transacoes">) {
  const user = await requireUser();
  const db = getDb();
  const month = parseMonth((await searchParams).mes) ?? todayIn(appTimeZone()).slice(0, 7);

  // Gráfico: os 6 meses que terminam no mês escolhido. Indicadores, pizza e histórico: só o mês escolhido.
  const months = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5));
  const [from] = monthRange(months[0]);
  const [monthStart, to] = monthRange(month);
  const all = listTransactions(db, user.id, from, to);
  const current = all.filter((t) => t.date >= monthStart);
  const totals = transactionTotals(current);
  const shares = transactionShares(totals);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="Transações"
        subtitle="Acompanhe entradas, saídas e o saldo das movimentações financeiras."
        right={<MonthPicker month={month} />}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={ArrowUp} color={UP} title="Entradas">
          <SignedMoney cents={totals.inflow} testId="tx-inflow" />
        </StatCard>
        <StatCard icon={ArrowDown} color={DOWN} title="Saídas">
          <SignedMoney cents={-totals.outflow} testId="tx-outflow" />
        </StatCard>
        <StatCard icon={Wallet} color={BLUE} title="Saldo das transações">
          <SignedMoney cents={totals.balance} testId="tx-balance" />
        </StatCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold">Evolução mensal das transações</h2>
              <p className="text-sm text-muted-foreground">Comparação entre entradas e saídas</p>
            </div>
            <TransactionBars data={monthlyTransactions(all, months)} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold">Distribuição das movimentações</h2>
              <p className="text-sm text-muted-foreground">Participação por tipo no período</p>
            </div>
            <TransactionPie inflow={totals.inflow} outflow={totals.outflow} shares={shares} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <SectionTitle icon={ArrowLeftRight} title="Histórico de transações" />
          <TransactionsTable
            items={current}
            kindHeader="Tipo"
            emptyText={`Nenhuma transação em ${monthLabel(month)}. Lance entradas e saídas na aba Lançamentos.`}
          />
          <TotalsBar
            label={`Totais do período (${monthLabel(month)})`}
            final={
              <span className="flex items-center gap-2">
                Saldo final: <SignedMoney cents={totals.balance} />
              </span>
            }
          >
            <TotalChip color={UP}>
              Total de entradas: <SignedMoney cents={totals.inflow} />
            </TotalChip>
            <TotalChip color={DOWN}>
              Total de saídas: <SignedMoney cents={-totals.outflow} />
            </TotalChip>
          </TotalsBar>
        </CardContent>
      </Card>
    </div>
  );
}
