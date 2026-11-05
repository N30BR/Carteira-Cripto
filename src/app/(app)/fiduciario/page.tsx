import Link from "next/link";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/current";
import { adjustChange, pickCurrency } from "@/lib/currency";
import { resolveCurrency } from "@/lib/currency-view";
import { listAccounts, listBalances } from "@/lib/fiat/accounts";
import { FIAT_PERIODS, buildFiatCurve, computeFiat, parseFiatPeriod } from "@/lib/fiat/calc";
import { appTimeZone, todayIn } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AllocationDonut } from "@/components/dashboard/allocation-donut";
import { BalanceCard } from "@/components/dashboard/balance-card";
import { CapitalChart } from "@/components/dashboard/capital-chart";
import { CurrencyMenu } from "@/components/dashboard/currency-menu";
import { FiatTable } from "@/components/dashboard/fiat-table";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { StaleBanner } from "@/components/dashboard/stale-banner";

export const metadata = { title: "$ · Carteira Cripto" };

const COOKIE = "moeda-fiat";
const DAY = 86_400_000;

export default async function FiatDashboardPage({ searchParams }: PageProps<"/fiduciario">) {
  const user = await requireUser();
  const params = await searchParams;
  const period = parseFiatPeriod(params.periodo);
  const requested = pickCurrency(params.moeda, (await cookies()).get(COOKIE)?.value, "BRL");
  const db = getDb();
  const accounts = listAccounts(db, user.id);

  if (!accounts.length) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <CardHeader>
          <CardTitle>Cadastre sua primeira conta</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 text-sm text-muted-foreground">
          Informe o saldo das suas contas (conta PF, conta PJ, caixinha…) e o dashboard mostra o total, a distribuição e
          a evolução.
          <Button asChild>
            <Link href="/ativos">Ir para Ativos</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const now = new Date();
  const today = todayIn(appTimeZone(), now);
  const balances = listBalances(db, user.id);
  const fiat = computeFiat(accounts, balances, today);
  const view = await resolveCurrency(db, "BRL", requested, "BRL", now);

  // Tudo é calculado em reais e convertido aqui para a moeda escolhida.
  const f = view.factorNow;
  const fAgo = (days: number) => view.factorAt(now.getTime() - days * DAY);
  const [f30, f365] = [fAgo(30), fAgo(365)];
  const rows = fiat.rows.map((r) => ({
    ...r,
    amount: r.amount * f,
    change1m: adjustChange(r.change1m, f, f30),
    change1y: adjustChange(r.change1y, f, f365),
  }));

  const total = fiat.total * f;
  const pastTotal = fiat.total30 === null ? null : fiat.total30 * f30;
  const changeAbs = pastTotal === null ? 0 : total - pastTotal;
  const changePct = pastTotal !== null && pastTotal > 0 ? (changeAbs / pastTotal) * 100 : null;

  const points = view.convertPoints(buildFiatCurve(balances, period, today, now));
  const slices = rows
    .filter((r) => r.share !== null && r.amount > 0)
    .map((r) => ({ symbol: r.name, value: r.amount, share: r.share! }));

  return (
    <div className="flex flex-col gap-6">
      <StaleBanner since={view.staleSince} now={now} warning={view.warning} />

      <Card>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <BalanceCard
              total={total}
              changeAbs={changeAbs}
              changePct={changePct}
              changeLabel="no mês"
              currency={view.currency}
            />
            <div className="flex items-center gap-2">
              <PeriodSelector options={FIAT_PERIODS} current={period} path="/fiduciario" query={{ moeda: requested }} />
              <CurrencyMenu current={view.currency} cookieName={COOKIE} />
            </div>
          </div>
          <CapitalChart points={points} currency={view.currency} emptyText="Sem saldos registrados" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Distribuição</CardTitle>
        </CardHeader>
        <CardContent>
          <AllocationDonut rows={slices} currency={view.currency} emptyText="Nenhuma conta com saldo positivo" />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="font-medium">Contas</h2>
        <FiatTable rows={rows} currency={view.currency} />
      </div>
    </div>
  );
}
