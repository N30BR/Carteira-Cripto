import { ArrowDown, ArrowLeftRight, ArrowUp, ChartColumn, ChartPie, Coins, CreditCard, Info, Layers, Target, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/current";
import { monthLabel, parseMonth } from "@/lib/cards/months";
import { listInstallments } from "@/lib/cards/store";
import { monthTotals } from "@/lib/cards/summary";
import { pickCurrency } from "@/lib/currency";
import { resolveCurrency } from "@/lib/currency-view";
import { formatPct } from "@/lib/format";
import { PERIOD_OPTIONS, parsePeriod } from "@/lib/portfolio/calc";
import { consolidate, type ComponentKey, type Tone } from "@/lib/summary/consolidate";
import { cryptoPeriod, fiatBalanceBrl } from "@/lib/summary/sources";
import { analysisWindow, zonedMidnight } from "@/lib/summary/window";
import { transactionTotals } from "@/lib/transactions/calc";
import { listTransactions } from "@/lib/transactions/store";
import { appTimeZone, todayIn } from "@/lib/validation";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CurrencyMenu } from "@/components/dashboard/currency-menu";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { ComponentBars, ComponentPie } from "@/components/finance/charts";
import { BLUE, DOWN, KindBadge, MINOR, NEUTRAL, SectionTitle, SignedMoney, StatCard, TotalChip, TotalsBar, UP, dateBr } from "@/components/finance/ui";
import { MonthPicker } from "@/components/month-picker";

export const metadata = { title: "Resumo · Carteira Cripto" };

const COOKIE = "moeda-resumo";
const DAY = 86_400_000;

const ICONS: Record<ComponentKey, LucideIcon> = {
  crypto: Coins,
  fiat: Wallet,
  invoices: CreditCard,
  inflow: ArrowUp,
  outflow: ArrowDown,
  variation: TrendingUp,
};
const SHORT: Record<ComponentKey, string> = {
  crypto: "Cripto",
  fiat: "Fiduciário",
  invoices: "Faturas",
  inflow: "Entradas",
  outflow: "Saídas",
  variation: "Variação",
};
const toneColor = (tone: Tone) => (tone === "neutral" ? NEUTRAL : tone === "out" ? DOWN : UP);

export default async function SummaryPage({ searchParams }: PageProps<"/resumo">) {
  const user = await requireUser();
  const params = await searchParams;
  const db = getDb();
  const now = new Date();
  const tz = appTimeZone();
  const today = todayIn(tz, now);
  const month = parseMonth(params.mes) ?? today.slice(0, 7);
  const period = parsePeriod(params.periodo);
  const requested = pickCurrency(params.moeda, (await cookies()).get(COOKIE)?.value, "BRL");

  // Período analisado: começa no dia 1 do mês de referência e dura o período escolhido.
  const win = analysisWindow(month, period);
  const startMs = zonedMidnight(win.fromDate, tz);
  const endMs = zonedMidnight(win.toDate, tz) + DAY;

  // Conversão para a moeda escolhida, com as cotações da aba Cripto (Binance).
  const viewBrl = await resolveCurrency(db, "BRL", requested, "BRL", now);
  const currency = viewBrl.currency;
  const viewUsdt = await resolveCurrency(db, "USDT", currency, "USDT", now, { historyDays: 365 });
  const scale = MINOR[currency];
  const fromBrlCents = (cents: number) => (cents / 100) * viewBrl.factorNow * scale;

  // Cada origem vem da sua área; a conta toda é feita uma vez só, em consolidate().
  const crypto = await cryptoPeriod(db, user.id, startMs, endMs, now);
  const cryptoRate = viewUsdt.currency === currency;
  // Valores cripto convertidos pela cotação da própria data (como na aba Cripto).
  const toRef = (usdt: number | null, t: number) =>
    usdt === null || !cryptoRate ? null : usdt * (t >= now.getTime() ? viewUsdt.factorNow : viewUsdt.factorAt(t)) * scale;
  const cryptoStart = toRef(crypto.startUsdt, startMs);
  const cryptoEnd = toRef(crypto.endUsdt, crypto.endMs);
  const fiat = fiatBalanceBrl(db, user.id, today);
  const invoices = monthTotals(listInstallments(db, user.id, win.invoiceMonths[0], win.invoiceMonths.at(-1)!)).total;
  const tx = transactionTotals(listTransactions(db, user.id, win.fromDate, win.toDate));
  const summary = consolidate({
    cryptoCents: cryptoStart,
    fiatCents: fromBrlCents(fiat.cents),
    invoicesCents: fromBrlCents(invoices),
    inflowCents: fromBrlCents(tx.inflow),
    outflowCents: fromBrlCents(tx.outflow),
    cryptoVariationCents: cryptoStart === null || cryptoEnd === null ? null : cryptoEnd - cryptoStart,
  });
  const byKey = Object.fromEntries(summary.components.map((c) => [c.key, c]));

  const periodLabel = period === "1M" ? monthLabel(month) : `${dateBr(win.fromDate)} a ${dateBr(win.toDate)}`;
  const invoiceLabel =
    win.invoiceMonths.length === 1 ? monthLabel(win.invoiceMonths[0]) : `${monthLabel(win.invoiceMonths[0])} a ${monthLabel(win.invoiceMonths.at(-1)!)}`;
  const variationEnd = todayIn(tz, new Date(Math.min(endMs, now.getTime()) - 1));
  const when = crypto.asOf
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(crypto.asOf)
    : null;
  const cryptoReason = cryptoRate ? crypto.reason : "Cotação indisponível";
  const staleNote = crypto.stale && <span className="block font-medium text-amber-400">Preços de {when} (desatualizados)</span>;
  const hints: Record<ComponentKey, React.ReactNode> = {
    crypto: crypto.empty ? (
      "Nenhum ativo cadastrado"
    ) : cryptoStart === null ? (
      `${cryptoReason}; fora da conta`
    ) : (
      <>
        Saldo em {dateBr(win.fromDate)} (início do período)
        {staleNote}
      </>
    ),
    fiat: fiat.empty
      ? "Nenhuma conta em R$"
      : fiat.oldest === fiat.newest
        ? `Saldo de ${dateBr(fiat.oldest!)}`
        : `Saldos de ${dateBr(fiat.oldest!)} a ${dateBr(fiat.newest!)}`,
    invoices: `Parcelas de ${invoiceLabel}`,
    inflow: `Transações de ${periodLabel}`,
    outflow: `Transações de ${periodLabel}`,
    variation: crypto.empty ? (
      "Nenhum ativo cadastrado"
    ) : cryptoStart === null || cryptoEnd === null ? (
      `${cryptoReason}; fora da conta`
    ) : (
      <>
        De {dateBr(win.fromDate)} a {dateBr(variationEnd)}
        {staleNote}
      </>
    ),
  };
  const valueOf = (key: ComponentKey) => {
    const c = byKey[key];
    return c.signedCents === null ? (
      <span className="text-base text-muted-foreground">Indisponível</span>
    ) : (
      <SignedMoney cents={c.signedCents} currency={currency} neutral={c.tone === "neutral"} testId={`sum-${key}`} />
    );
  };
  const items = summary.components.map((c) => ({ ...c, short: SHORT[c.key] }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">Resumo</h1>
            <CurrencyMenu current={currency} cookieName={COOKIE} />
          </div>
          <p className="text-sm text-muted-foreground">Visão consolidada dos saldos, faturas e movimentações financeiras.</p>
          {viewBrl.warning && <p className="text-xs text-amber-400">{viewBrl.warning}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSelector options={PERIOD_OPTIONS} current={period} path="/resumo" query={{ moeda: requested, mes: month }} />
          <MonthPicker month={month} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summary.components.map((c) => (
          <StatCard compact key={c.key} icon={c.key === "variation" && c.tone === "out" ? TrendingDown : ICONS[c.key]} color={toneColor(c.tone)} title={c.label} hint={hints[c.key]}>
            {valueOf(c.key)}
          </StatCard>
        ))}
      </div>

      <Card>
        <CardContent className="grid gap-6 lg:grid-cols-[1fr_auto_1fr]">
          <div className="flex flex-col gap-3">
            <SectionTitle icon={Target} title="Resumo financeiro geral" />
            <span className="text-4xl">
              <SignedMoney cents={summary.result} currency={currency} testId="sum-result" />
            </span>
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                <Info className="size-3.5" /> Consolidação estimada (sem conciliação)
              </span>
              <p>
                Saldos (cripto no início do período e reais) + entradas e valorização − faturas, saídas e desvalorização de{" "}
                {periodLabel}. Não é o patrimônio efetivo: um gasto que já baixou o saldo de uma conta aparece de novo como fatura ou
                saída.
              </p>
              {(summary.missing.includes("crypto") || summary.missing.includes("variation")) && !crypto.empty && (
                <p className="text-amber-400">Cripto fora da conta: {cryptoReason?.toLowerCase()}.</p>
              )}
            </div>
          </div>
          <div className="hidden w-px bg-border lg:block" />
          <dl className="flex flex-col justify-center gap-2 text-sm">
            <div className="flex items-center justify-between gap-4 border-b py-2">
              <dt className="flex items-center gap-2">
                <span className="size-3 rounded-sm" style={{ background: NEUTRAL }} /> Saldos patrimoniais (neutros)
              </dt>
              <dd>
                <SignedMoney cents={summary.neutral} currency={currency} neutral testId="sum-neutral" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b py-2">
              <dt className="flex items-center gap-2">
                <span className="size-3 rounded-sm" style={{ background: UP }} /> Total de entradas (positivos)
              </dt>
              <dd>
                <SignedMoney cents={summary.positive} currency={currency} testId="sum-positive" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b py-2">
              <dt className="flex items-center gap-2">
                <span className="size-3 rounded-sm" style={{ background: DOWN }} /> Total de saídas (negativos)
              </dt>
              <dd>
                <SignedMoney cents={-summary.negative} currency={currency} testId="sum-negative" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5" style={{ backgroundColor: `${BLUE}26` }}>
              <dt className="flex items-center gap-2 font-medium">
                <span className="size-3 rounded-sm" style={{ background: BLUE }} /> Resultado consolidado
              </dt>
              <dd className="text-base">
                <SignedMoney cents={summary.result} currency={currency} />
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <SectionTitle icon={ChartColumn} title="Comparativo dos componentes" subtitle="Saldos, entradas e saídas consolidadas" />
            <ComponentBars items={items} currency={currency} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-4">
            <SectionTitle
              icon={ChartPie}
              title="Distribuição do resumo"
              subtitle="Participação por componente"
              right={
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs" style={{ color: BLUE, backgroundColor: `${BLUE}26` }}>
                  <Info className="size-3.5" /> Distribuição por valor absoluto
                </span>
              }
            />
            <ComponentPie items={items} currency={currency} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <SectionTitle icon={Layers} title="Composição do resumo" />
          <div className="overflow-x-auto rounded-xl border">
            <Table aria-label="Composição do resumo">
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Origem</TableHead>
                  <TableHead>Classificação</TableHead>
                  <TableHead className="text-right">Valor ({currency === "BRL" ? "R$" : currency === "USDT" ? "US$" : "₿"})</TableHead>
                  <TableHead className="text-right">Participação</TableHead>
                  <TableHead>Observação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.components.map((c) => {
                  const Icon = c.key === "inflow" || c.key === "outflow" ? ArrowLeftRight : ICONS[c.key];
                  return (
                    <TableRow key={c.key}>
                      <TableCell>
                        <span className="flex items-center gap-2 font-medium">
                          <Icon className="size-4 text-muted-foreground" /> {c.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        <KindBadge kind={c.tone} label={c.classification} />
                      </TableCell>
                      <TableCell className="text-right">{valueOf(c.key)}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.share === null ? "—" : formatPct(c.share)}</TableCell>
                      <TableCell className="text-muted-foreground">{c.note}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <TotalsBar
            label={`Totais do período (${periodLabel})`}
            final={
              <span className="flex items-center gap-2">
                Resultado consolidado (estimado): <SignedMoney cents={summary.result} currency={currency} />
              </span>
            }
          >
            <TotalChip color={NEUTRAL}>
              Saldos (neutros): <SignedMoney cents={summary.neutral} currency={currency} neutral />
            </TotalChip>
            <TotalChip color={UP}>
              Entradas totais: <SignedMoney cents={summary.positive} currency={currency} />
            </TotalChip>
            <TotalChip color={DOWN}>
              Saídas totais: <SignedMoney cents={-summary.negative} currency={currency} />
            </TotalChip>
          </TotalsBar>
        </CardContent>
      </Card>
    </div>
  );
}
