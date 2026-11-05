import Link from "next/link";
import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/current";
import { listHoldings } from "@/lib/holdings/holdings";
import { getCurrentPrices, getHistory } from "@/lib/prices";
import { buildCurve, computePortfolio, parsePeriod } from "@/lib/portfolio/calc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AllocationDonut } from "@/components/dashboard/allocation-donut";
import { BalanceCard } from "@/components/dashboard/balance-card";
import { CapitalChart } from "@/components/dashboard/capital-chart";
import { HoldingsTable } from "@/components/dashboard/holdings-table";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { StaleBanner } from "@/components/dashboard/stale-banner";

export const metadata = { title: "Dashboard · Carteira Cripto" };

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const period = parsePeriod((await searchParams).periodo);
  const db = getDb();
  const holdings = listHoldings(db, user.id);

  if (!holdings.length) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <CardHeader>
          <CardTitle>Adicione seu primeiro ativo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 text-sm text-muted-foreground">
          Informe quanto você tem de cada moeda e o dashboard mostra o saldo, a distribuição e a evolução.
          <Button asChild>
            <Link href="/ativos">Ir para Ativos</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const now = new Date();
  const ids = holdings.map((h) => h.coinId);
  const current = await getCurrentPrices(db, ids, now);
  // Histórico só das moedas com preço: as outras nem entram na curva.
  const hist = await getHistory(db, ids.filter((id) => current.prices[id]), period, now);
  const portfolio = computePortfolio(holdings, current.prices);
  const curve = buildCurve(holdings, hist.history, current.prices, period, now);

  const staleSince = [current.stale && current.fetchedAt, hist.stale && hist.oldestFetchedAt]
    .filter((d): d is Date => d instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  const slices = portfolio.rows
    .filter((r) => r.value !== null && r.share !== null && r.value > 0)
    .map((r) => ({ symbol: r.symbol, value: r.value!, share: r.share! }));

  return (
    <div className="flex flex-col gap-6">
      <StaleBanner since={staleSince} now={now} unavailable={portfolio.total === null} />

      <Card>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <BalanceCard
              total={portfolio.total}
              change24hUsd={portfolio.change24hUsd}
              change24hPct={portfolio.change24hPct}
            />
            <PeriodSelector current={period} />
          </div>
          <CapitalChart points={curve.points} period={period} missingHistory={curve.missingHistory} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Distribuição</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationDonut rows={slices} />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-3">
          <h2 className="font-medium">Ativos</h2>
          <HoldingsTable rows={portfolio.rows} />
        </div>
      </div>
    </div>
  );
}
