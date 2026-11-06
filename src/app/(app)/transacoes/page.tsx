import { ArrowDown, ArrowLeftRight, ArrowUp, Wallet } from "lucide-react";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { requireModule } from "@/lib/auth/modules";
import { parseMonth } from "@/lib/cards/months";
import { brlDisplay, staleRateWarning } from "@/lib/currency-display";
import { parsePeriod } from "@/lib/portfolio/calc";
import { analysisWindow, chartMonths, periodLabel } from "@/lib/summary/window";
import { monthlyTransactions, transactionShares, transactionTotals } from "@/lib/transactions/calc";
import { monthRange } from "@/lib/transactions/period";
import { listTransactions } from "@/lib/transactions/store";
import { appTimeZone, todayIn } from "@/lib/validation";
import { Card, CardContent } from "@/components/ui/card";
import { TransactionBars, TransactionPie } from "@/components/finance/charts";
import { PeriodHeader } from "@/components/finance/period-header";
import { TransactionsTable } from "@/components/finance/transactions";
import { BLUE, DOWN, SectionTitle, SignedMoney, StatCard, TotalChip, TotalsBar, UP } from "@/components/finance/ui";

export const metadata = { title: "Transações · BlackHole Dashboard" };

const COOKIE = "moeda-transacoes";

export default async function TransactionsPage({ searchParams }: PageProps<"/transacoes">) {
  const user = await requireModule("transactions");
  const params = await searchParams;
  const db = getDb();
  const month = parseMonth(params.mes) ?? todayIn(appTimeZone()).slice(0, 7);
  const period = parsePeriod(params.periodo);
  const display = await brlDisplay(db, params.moeda, (await cookies()).get(COOKIE)?.value);
  const { currency, convert } = display;

  // Período: começa no dia 1 do mês de referência. Indicadores, pizza e histórico: o período.
  // Gráfico: os meses do período (3M em diante) ou os 6 meses que terminam no mês.
  const win = analysisWindow(month, period);
  const months = chartMonths(month, period);
  const [chartFrom] = monthRange(months[0]);
  const [, chartTo] = monthRange(months.at(-1)!);
  const all = listTransactions(db, user.id, chartFrom < win.fromDate ? chartFrom : win.fromDate, chartTo > win.toDate ? chartTo : win.toDate);
  const current = all.filter((t) => t.date >= win.fromDate && t.date <= win.toDate);
  const totals = transactionTotals(current);
  const shares = transactionShares(totals);
  const label = periodLabel(month, period);
  const series = monthlyTransactions(all, months).map((m) => ({ ...m, inflow: convert(m.inflow), outflow: convert(m.outflow) }));

  return (
    <div className="flex flex-col gap-6">
      <PeriodHeader
        title="Transações"
        subtitle="Acompanhe entradas, saídas e o saldo das movimentações financeiras."
        currency={currency}
        requested={display.requested}
        cookieName={COOKIE}
        period={period}
        path="/transacoes"
        month={month}
        warning={display.warning ?? staleRateWarning(display.staleSince, appTimeZone())}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={ArrowUp} color={UP} title="Entradas">
          <SignedMoney cents={convert(totals.inflow)} currency={currency} testId="tx-inflow" />
        </StatCard>
        <StatCard icon={ArrowDown} color={DOWN} title="Saídas">
          <SignedMoney cents={-convert(totals.outflow)} currency={currency} testId="tx-outflow" />
        </StatCard>
        <StatCard icon={Wallet} color={BLUE} title="Saldo das transações">
          <SignedMoney cents={convert(totals.balance)} currency={currency} testId="tx-balance" />
        </StatCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold">Evolução mensal das transações</h2>
              <p className="text-sm text-muted-foreground">Comparação entre entradas e saídas</p>
            </div>
            <TransactionBars data={series} currency={currency} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold">Distribuição das movimentações</h2>
              <p className="text-sm text-muted-foreground">Participação por tipo no período</p>
            </div>
            <TransactionPie inflow={convert(totals.inflow)} outflow={convert(totals.outflow)} shares={shares} currency={currency} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <SectionTitle icon={ArrowLeftRight} title="Histórico de transações" />
          <TransactionsTable
            items={current}
            kindHeader="Tipo"
            currency={currency}
            factor={convert(1)}
            emptyText={`Nenhuma transação em ${label}. Lance entradas e saídas na aba Lançamentos.`}
          />
          <TotalsBar
            label={`Totais do período (${label})`}
            final={
              <span className="flex items-center gap-2">
                Saldo final: <SignedMoney cents={convert(totals.balance)} currency={currency} />
              </span>
            }
          >
            <TotalChip color={UP}>
              Total de entradas: <SignedMoney cents={convert(totals.inflow)} currency={currency} />
            </TotalChip>
            <TotalChip color={DOWN}>
              Total de saídas: <SignedMoney cents={-convert(totals.outflow)} currency={currency} />
            </TotalChip>
          </TotalsBar>
        </CardContent>
      </Card>
    </div>
  );
}
