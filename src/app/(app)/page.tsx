import Link from "next/link";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { requireModule } from "@/lib/auth/modules";
import { adjustChange, pickCurrency } from "@/lib/currency";
import { resolveCurrency } from "@/lib/currency-view";
import { listHoldings } from "@/lib/holdings/holdings";
import { getCurrentPrices, getHistory } from "@/lib/prices";
import { PERIODS, PERIOD_OPTIONS, buildCurve, computePortfolio, parsePeriod, periodChanges, totalChange } from "@/lib/portfolio/calc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AllocationDonut } from "@/components/dashboard/allocation-donut";
import { BalanceCard, type BalanceChange } from "@/components/dashboard/balance-card";
import { CapitalChart } from "@/components/dashboard/capital-chart";
import { CurrencyMenu } from "@/components/dashboard/currency-menu";
import { HoldingsTable } from "@/components/dashboard/holdings-table";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { StaleBanner } from "@/components/dashboard/stale-banner";

export const metadata = { title: "Cripto · BlackHole Dashboard" };

const COOKIE = "moeda-cripto";
const DAY = 86_400_000;

export default async function CryptoDashboardPage({ searchParams }: PageProps<"/">) {
  const user = await requireModule("crypto");
  const params = await searchParams;
  const period = parsePeriod(params.periodo);
  const requested = pickCurrency(params.moeda, (await cookies()).get(COOKIE)?.value, "USDT");
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
  // Histórico só das moedas com preço. Os dois são usados: 30 dias (1D/1S/1M) e 1 ano (3M/6M/1A),
  // no gráfico, no saldo e nas variações da tabela; cada um fica guardado por 1 hora.
  const priced = ids.filter((id) => current.prices[id]);
  // Com a referência em BTC, o mesmo preço do BTC da carteira entra na conversão (BTC vale exatamente ₿ 1).
  const btcPrice =
    requested === "BTC" ? (current.prices.BTC ?? (await getCurrentPrices(db, ["BTC"], now)).prices.BTC) : undefined;
  const [hist30, hist365, view] = await Promise.all([
    getHistory(db, priced, "1M", now),
    getHistory(db, priced, "1A", now),
    resolveCurrency(db, "USDT", requested, "USDT", now, { btcUsdt: btcPrice, historyDays: 365 }),
  ]);
  const portfolio = computePortfolio(holdings, current.prices);
  const changes = periodChanges(ids, current.prices, hist30.history, hist365.history, now);

  // Tudo é calculado em USDT e convertido aqui para a moeda escolhida.
  const f = view.factorNow;
  const fAgo = (days: number) => view.factorAt(now.getTime() - days * DAY);
  const [f1, f7, f30, f182, f365] = [view.factor24hAgo, fAgo(7), fAgo(30), fAgo(182), fAgo(365)];
  const tableRows = portfolio.rows.map((r) => {
    const c = changes[r.coinId];
    return {
      ...r,
      price: r.price === null ? null : r.price * f,
      value: r.value === null ? null : r.value * f,
      change24h: adjustChange(r.change24h, f, f1),
      change7d: adjustChange(c.change7d, f, f7),
      change1m: adjustChange(c.change1m, f, f30),
      change6m: adjustChange(c.change6m, f, f182),
      change1y: adjustChange(c.change1y, f, f365),
    };
  });

  const total = portfolio.total === null ? null : portfolio.total * f;
  const pastTotal = portfolio.total === null ? null : (portfolio.total - portfolio.change24hUsd) * f1;
  const changeAbs = total !== null && pastTotal !== null ? total - pastTotal : 0;
  const changePct = portfolio.change24hPct !== null && pastTotal && pastTotal > 0 ? (changeAbs / pastTotal) * 100 : null;

  const hist = PERIODS[period].sourceDays === 365 ? hist365 : hist30;
  // Variação do saldo no período escolhido: 1D pela variação de 24 h; os demais com as mesmas moedas,
  // preço de agora × preço de então, cada um pela cotação da sua época.
  const longChange = (label: string, days: number, fPast: number): BalanceChange => {
    const c = totalChange(holdings, current.prices, hist.history, days, now);
    if (!c) return { label, abs: 0, pct: null };
    const nowRef = c.now * f;
    const pastRef = c.past * fPast;
    return { label, abs: nowRef - pastRef, pct: pastRef > 0 ? (nowRef / pastRef - 1) * 100 : null };
  };
  const balanceChanges: BalanceChange[] = [
    period === "1D"
      ? { label: "1D", abs: changeAbs, pct: changePct }
      : longChange(period, PERIODS[period].days, fAgo(PERIODS[period].days)),
  ];

  const curve = buildCurve(holdings, hist.history, current.prices, period, now);
  const points = view.convertPoints(curve.points);

  const staleSince =
    [
      current.stale && current.fetchedAt,
      hist30.stale && hist30.oldestFetchedAt,
      hist365.stale && hist365.oldestFetchedAt,
      view.staleSince,
    ]
      .filter((d): d is Date => d instanceof Date)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  const slices = tableRows
    .filter((r) => r.value !== null && r.share !== null && r.value > 0)
    .map((r) => ({ symbol: r.symbol, value: r.value!, share: r.share! }));

  return (
    <div className="flex flex-col gap-6">
      <StaleBanner since={staleSince} now={now} unavailable={portfolio.total === null} warning={view.warning} />

      <Card>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <BalanceCard
              total={total}
              changes={balanceChanges}
              currency={view.currency}
            />
            <div className="flex items-center gap-2">
              <PeriodSelector options={PERIOD_OPTIONS} current={period} path="/" query={{ moeda: requested }} />
              <CurrencyMenu current={view.currency} cookieName={COOKIE} />
            </div>
          </div>
          <CapitalChart points={points} currency={view.currency} missingHistory={curve.missingHistory} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Distribuição</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationDonut rows={slices} currency={view.currency} />
          </CardContent>
        </Card>
        <HoldingsTable rows={tableRows} currency={view.currency} />
      </div>
    </div>
  );
}
