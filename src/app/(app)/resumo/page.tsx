import { ArrowDown, ArrowLeftRight, ArrowUp, ChartColumn, ChartPie, Coins, CreditCard, Info, Layers, Target, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/current";
import { monthLabel, parseMonth } from "@/lib/cards/months";
import { listInstallments } from "@/lib/cards/store";
import { monthTotals } from "@/lib/cards/summary";
import { formatPct } from "@/lib/format";
import { consolidate, type ComponentKey } from "@/lib/summary/consolidate";
import { cryptoBalanceBrl, fiatBalanceBrl } from "@/lib/summary/sources";
import { transactionTotals } from "@/lib/transactions/calc";
import { monthRange } from "@/lib/transactions/period";
import { listTransactions } from "@/lib/transactions/store";
import { appTimeZone, todayIn } from "@/lib/validation";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ComponentBars, ComponentPie } from "@/components/finance/charts";
import { BLUE, DOWN, KindBadge, PageTitle, SectionTitle, SignedMoney, StatCard, TotalChip, TotalsBar, UP, dateBr } from "@/components/finance/ui";
import { MonthPicker } from "@/components/month-picker";

export const metadata = { title: "Resumo · Carteira Cripto" };

const ICONS: Record<ComponentKey, LucideIcon> = {
  crypto: Coins,
  fiat: Wallet,
  invoices: CreditCard,
  inflow: ArrowUp,
  outflow: ArrowDown,
};
const SHORT: Record<ComponentKey, string> = {
  crypto: "Cripto",
  fiat: "Fiduciário",
  invoices: "Faturas",
  inflow: "Entradas",
  outflow: "Saídas",
};

export default async function SummaryPage({ searchParams }: PageProps<"/resumo">) {
  const user = await requireUser();
  const db = getDb();
  const now = new Date();
  const today = todayIn(appTimeZone(), now);
  const month = parseMonth((await searchParams).mes) ?? today.slice(0, 7);
  const [from, to] = monthRange(month);

  // Cada origem vem da sua área; a conta toda é feita uma vez só, em consolidate().
  const crypto = await cryptoBalanceBrl(db, user.id, now);
  const fiat = fiatBalanceBrl(db, user.id, today);
  const invoices = monthTotals(listInstallments(db, user.id, month, month)).total;
  const tx = transactionTotals(listTransactions(db, user.id, from, to));
  const summary = consolidate({
    cryptoCents: crypto.cents,
    fiatCents: fiat.cents,
    invoicesCents: invoices,
    inflowCents: tx.inflow,
    outflowCents: tx.outflow,
  });
  const byKey = Object.fromEntries(summary.components.map((c) => [c.key, c]));

  const hints: Record<ComponentKey, string> = {
    crypto: crypto.empty
      ? "Nenhum ativo cadastrado"
      : crypto.cents === null
        ? `${crypto.reason}; fora da conta`
        : `Posição atual • 1 USDT = R$ ${crypto.usdtBrl!.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`,
    fiat: fiat.empty ? "Nenhuma conta em R$" : `Último saldo em ${dateBr(fiat.asOf!)}`,
    invoices: `Parcelas de ${monthLabel(month)}`,
    inflow: `Transações de ${monthLabel(month)}`,
    outflow: `Transações de ${monthLabel(month)}`,
  };
  const valueOf = (key: ComponentKey) => {
    const v = byKey[key].signedCents;
    return v === null ? <span className="text-base text-muted-foreground">Indisponível</span> : <SignedMoney cents={v} testId={`sum-${key}`} />;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Resumo" subtitle="Visão consolidada dos saldos, faturas e movimentações financeiras." right={<MonthPicker month={month} />} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {summary.components.map((c) => (
          <StatCard compact key={c.key} icon={ICONS[c.key]} color={c.key === "fiat" ? BLUE : (c.signedCents ?? 0) < 0 ? DOWN : UP} title={c.label} hint={hints[c.key]}>
            {valueOf(c.key)}
          </StatCard>
        ))}
      </div>

      <Card>
        <CardContent className="grid gap-6 lg:grid-cols-[1fr_auto_1fr]">
          <div className="flex flex-col gap-3">
            <SectionTitle icon={Target} title="Resumo financeiro geral" />
            <span className="text-4xl">
              <SignedMoney cents={summary.result} testId="sum-result" />
            </span>
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                <Info className="size-3.5" /> Consolidação estimada (sem conciliação)
              </span>
              <p>
                Saldos patrimoniais (cripto e reais) + entradas − faturas − saídas de {monthLabel(month)}. Não é o patrimônio
                efetivo: um gasto que já baixou o saldo de uma conta aparece de novo como fatura ou saída.
              </p>
              {summary.missing.includes("crypto") && <p className="text-amber-400">Saldo cripto fora da conta: {crypto.reason?.toLowerCase()}.</p>}
            </div>
          </div>
          <div className="hidden w-px bg-border lg:block" />
          <dl className="flex flex-col justify-center gap-2 text-sm">
            <div className="flex items-center justify-between gap-4 border-b py-2">
              <dt className="flex items-center gap-2">
                <span className="size-3 rounded-sm" style={{ background: UP }} /> Total de entradas (positivos)
              </dt>
              <dd>
                <SignedMoney cents={summary.positive} testId="sum-positive" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b py-2">
              <dt className="flex items-center gap-2">
                <span className="size-3 rounded-sm" style={{ background: DOWN }} /> Total de saídas (negativos)
              </dt>
              <dd>
                <SignedMoney cents={-summary.negative} testId="sum-negative" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5" style={{ backgroundColor: `${BLUE}26` }}>
              <dt className="flex items-center gap-2 font-medium">
                <span className="size-3 rounded-sm" style={{ background: BLUE }} /> Resultado consolidado
              </dt>
              <dd className="text-base">
                <SignedMoney cents={summary.result} />
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <SectionTitle icon={ChartColumn} title="Comparativo dos componentes" subtitle="Entradas e saídas consolidadas" />
            <ComponentBars items={summary.components.map((c) => ({ ...c, short: SHORT[c.key] }))} />
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
            <ComponentPie items={summary.components.map((c) => ({ ...c, short: SHORT[c.key] }))} />
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
                  <TableHead className="text-right">Valor (R$)</TableHead>
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
                        <KindBadge kind={(c.signedCents ?? 0) < 0 ? "out" : "in"} label={c.classification} />
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
            label={`Totais do período (${monthLabel(month)})`}
            final={
              <span className="flex items-center gap-2">
                Resultado consolidado (estimado): <SignedMoney cents={summary.result} />
              </span>
            }
          >
            <TotalChip color={UP}>
              Entradas totais: <SignedMoney cents={summary.positive} />
            </TotalChip>
            <TotalChip color={DOWN}>
              Saídas totais: <SignedMoney cents={-summary.negative} />
            </TotalChip>
          </TotalsBar>
        </CardContent>
      </Card>
    </div>
  );
}
