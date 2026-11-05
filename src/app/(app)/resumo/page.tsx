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
import { parsePeriod } from "@/lib/portfolio/calc";
import { consolidate, type ComponentKey, type Tone } from "@/lib/summary/consolidate";
import { cryptoPeriod, fiatBalanceBrl } from "@/lib/summary/sources";
import { analysisWindow, invoicePeriodLabel, zonedMidnight } from "@/lib/summary/window";
import { staleRateWarning } from "@/lib/currency-display";
import { getCurrentPrices } from "@/lib/prices";
import { transactionTotals } from "@/lib/transactions/calc";
import { listTransactions } from "@/lib/transactions/store";
import { appTimeZone, todayIn } from "@/lib/validation";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ComponentBars, ComponentPie } from "@/components/finance/charts";
import { BLUE, DOWN, KindBadge, MINOR, NEUTRAL, SectionTitle, SignedMoney, StatCard, TotalChip, TotalsBar, UP, dateBr } from "@/components/finance/ui";
import { PeriodHeader } from "@/components/finance/period-header";

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
// Saldos neutros (azul); variação informativa em verde/vermelho conforme o sinal.
const toneColor = (tone: Tone, v: number | null) => (tone === "neutral" ? NEUTRAL : tone === "out" || (tone === "info" && (v ?? 0) < 0) ? DOWN : UP);

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
  // Em BTC usa o mesmo preço do BTC da carteira, para 1 BTC valer exatamente ₿ 1 (como na aba Cripto).
  const btcUsdt = currency === "BTC" ? (await getCurrentPrices(db, ["BTC"], now)).prices.BTC : undefined;
  const [viewUsdt, crypto] = await Promise.all([
    resolveCurrency(db, "USDT", currency, "USDT", now, { historyDays: 365, btcUsdt }),
    // Cada origem vem da sua área; a conta toda é feita uma vez só, em consolidate().
    cryptoPeriod(db, user.id, startMs, endMs, now),
  ]);
  const scale = MINOR[currency];
  // Em BRL não há conversão: os centavos ficam exatos.
  const fromBrlCents = (cents: number) => (currency === "BRL" ? cents : (cents * viewBrl.factorNow * scale) / 100);
  const cryptoRate = viewUsdt.currency === currency;
  // Valores cripto convertidos pela cotação da própria data (como na aba Cripto).
  const toRef = (usdt: number | null, t: number) =>
    usdt === null || !cryptoRate ? null : usdt * (t >= now.getTime() ? viewUsdt.factorNow : viewUsdt.factorAt(t)) * scale;
  // Saldo cripto: total atual. Variação: do início do período até o fim (ou agora), só informativa.
  const cryptoNow = toRef(crypto.nowUsdt, now.getTime());
  const cryptoStart = toRef(crypto.startUsdt, startMs);
  const cryptoEnd = toRef(crypto.endUsdt, crypto.endMs);
  const fiat = fiatBalanceBrl(db, user.id, today);
  const invoices = monthTotals(listInstallments(db, user.id, win.invoiceMonths[0], win.invoiceMonths.at(-1)!)).total;
  const tx = transactionTotals(listTransactions(db, user.id, win.fromDate, win.toDate));
  const summary = consolidate({
    cryptoCents: cryptoNow,
    fiatCents: fromBrlCents(fiat.cents),
    invoicesCents: fromBrlCents(invoices),
    inflowCents: fromBrlCents(tx.inflow),
    outflowCents: fromBrlCents(tx.outflow),
    cryptoVariationCents: cryptoStart === null || cryptoEnd === null ? null : cryptoEnd - cryptoStart,
  });
  const byKey = Object.fromEntries(summary.components.map((c) => [c.key, c]));

  const periodLabel = period === "1M" ? monthLabel(month) : `${dateBr(win.fromDate)} a ${dateBr(win.toDate)}`;
  const invoiceLabel = invoicePeriodLabel(month, period);
  const notStarted = startMs >= now.getTime();
  const staleSince = [viewBrl.staleSince, viewUsdt.staleSince].filter((d): d is Date => d instanceof Date).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const variationEnd = todayIn(tz, new Date(Math.min(endMs, now.getTime()) - 1));
  const when = crypto.asOf
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(crypto.asOf)
    : null;
  const cryptoReason = cryptoRate ? crypto.reason : "Cotação indisponível";
  const staleNote = crypto.stale && <span className="block font-medium text-amber-400">Preços de {when} (desatualizados)</span>;
  const hints: Record<ComponentKey, React.ReactNode> = {
    crypto: crypto.empty ? (
      "Nenhum ativo cadastrado"
    ) : cryptoNow === null ? (
      `${cryptoRate ? "Preços indisponíveis" : "Cotação indisponível"}; fora da conta`
    ) : (
      <>
        Saldo total atual{when ? ` (preços de ${when})` : ""}
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
      notStarted ? (
        "Período ainda não começou"
      ) : (
        <>
          De {dateBr(win.fromDate)} a {dateBr(variationEnd)} • só comparação, já incluída no saldo
          {staleNote}
        </>
      )
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
      <PeriodHeader
        title="Resumo"
        subtitle="Visão consolidada dos saldos, faturas e movimentações financeiras."
        currency={currency}
        requested={requested}
        cookieName={COOKIE}
        period={period}
        path="/resumo"
        month={month}
        warning={viewBrl.warning ?? staleRateWarning(staleSince, tz)}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summary.components.map((c) => (
          <StatCard compact key={c.key} icon={c.key === "variation" && (c.signedCents ?? 0) < 0 ? TrendingDown : ICONS[c.key]} color={toneColor(c.tone, c.signedCents)} title={c.label} hint={hints[c.key]}>
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
                Saldos (cripto total atual e reais) + entradas − faturas e saídas de {periodLabel}. Não é o patrimônio efetivo:
                um gasto que já baixou o saldo de uma conta aparece de novo como fatura ou saída.
              </p>
              <p className="text-xs">
                A variação cripto serve só para comparar o período: o saldo cripto atual já a inclui, então ela não é somada nem
                descontada.
              </p>
              {summary.missing.includes("crypto") && !crypto.empty && <p className="text-amber-400">Saldo cripto fora da conta: preços ou cotação indisponíveis.</p>}
              {!summary.missing.includes("crypto") && summary.missing.includes("variation") && !crypto.empty && (
                <p className="text-amber-400">Variação cripto indisponível: {cryptoReason?.toLowerCase()}.</p>
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
            <div className="flex items-center justify-between gap-4 border-b py-2">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <span className="size-3 rounded-sm border" style={{ borderColor: toneColor("info", byKey.variation.signedCents) }} /> Variação cripto
                (informativa, não somada)
              </dt>
              <dd>
                {byKey.variation.signedCents === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <SignedMoney cents={byKey.variation.signedCents} currency={currency} testId="sum-variation-panel" />
                )}
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
                        <KindBadge
                          kind={c.tone === "info" ? (!c.signedCents ? "neutral" : c.signedCents < 0 ? "out" : "in") : c.tone}
                          label={c.classification}
                        />
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
