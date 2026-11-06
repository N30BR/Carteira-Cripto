import Link from "next/link";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { requireModule } from "@/lib/auth/modules";
import { addMonths, monthLabel, monthShort, parseMonth } from "@/lib/cards/months";
import { listCardAccounts, type CardAccount } from "@/lib/cards/accounts";
import { hasExpenses, listInstallments } from "@/lib/cards/store";
import { cardSummary, monthTotals, monthlySeries, openPurchases, projection, topCategories } from "@/lib/cards/summary";
import { brlDisplay, staleRateWarning } from "@/lib/currency-display";
import { parsePeriod } from "@/lib/portfolio/calc";
import { analysisWindow, chartMonths, invoicePeriodLabel } from "@/lib/summary/window";
import { cn } from "@/lib/utils";
import { appTimeZone, todayIn } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NATURE_COLOR } from "@/components/cards/colors";
import { accountColors, money } from "@/components/finance/ui";
import { PeriodHeader } from "@/components/finance/period-header";
import { Priv } from "@/components/priv";
import { CategoryPie, InvoiceBars, NaturePie } from "@/components/cards/invoice-charts";

export const metadata = { title: "Faturas · BlackHole Dashboard" };

const COOKIE = "moeda-faturas";

function Indicator({ title, value, hint, color, testId }: { title: string; value: React.ReactNode; hint?: string; color: string; testId?: string }) {
  return (
    <div className="flex gap-3 rounded-xl border bg-card p-4">
      <span className="w-1 shrink-0 rounded-full" style={{ background: color }} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</span>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <span className="text-2xl font-semibold tabular-nums" data-testid={testId}>
            {value}
          </span>
          {hint && (
            <span className="text-xs font-medium" style={{ color }}>
              {hint}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default async function InvoicesPage({ searchParams }: PageProps<"/faturas">) {
  const user = await requireModule("invoices");
  const params = await searchParams;
  const month = parseMonth(params.mes) ?? todayIn(appTimeZone()).slice(0, 7);
  const period = parsePeriod(params.periodo);
  const display = await brlDisplay(getDb(), params.moeda, (await cookies()).get(COOKIE)?.value);
  const { currency, convert } = display;
  // Valores pessoais: no modo discreto viram "***".
  const brl = (v: number) => <Priv>{money(v, currency)}</Priv>;
  // Valores convertidos para a moeda escolhida (unidades mínimas: centavos; satoshis em BTC).
  const rows = listInstallments(getDb(), user.id, addMonths(month, -11), "2099-12").map((r) => ({ ...r, amountCents: convert(r.amountCents) }));
  // Período: começa no mês de referência; as faturas são mensais (1D, 1S e 1M = o mês).
  const win = analysisWindow(month, period);
  // Faturas são mensais: em 1D, 1S e 1M o rótulo é o mês (os valores são do mês inteiro).
  const label = invoicePeriodLabel(month, period);
  const single = win.invoiceMonths.length === 1;
  const accounts = listCardAccounts(getDb(), user.id);
  const colors = accountColors(accounts);
  const kindLabel = (a: CardAccount) => (a.kind === "PF" ? "Pessoa Física (PF)" : "Pessoa Jurídica (PJ)");

  const header = (
    <PeriodHeader
      eyebrow="Finanças / Fiduciário"
      title="Dashboard de controle financeiro"
      subtitle={<p className="mt-1 text-xs tracking-widest uppercase">Visão geral • {label}</p>}
      currency={currency}
      requested={display.requested}
      cookieName={COOKIE}
      period={period}
      path="/faturas"
      month={month}
      warning={display.warning ?? staleRateWarning(display.staleSince, appTimeZone())}
    />
  );

  if (!hasExpenses(getDb(), user.id)) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card className="mx-auto max-w-md text-center">
          <CardHeader>
            <CardTitle>Nenhum lançamento ainda</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 text-sm text-muted-foreground">
            Lance os gastos dos cartões e o dashboard mostra as faturas, a distribuição e as parcelas futuras.
            <Button asChild>
              <Link href={`/lancamentos?mes=${month}`}>Ir para Lançamentos</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const monthRows = rows.filter((r) => win.invoiceMonths.includes(r.invoiceMonth));
  const totals = monthTotals(monthRows);
  const last6 = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5));
  const last12 = Array.from({ length: 12 }, (_, i) => addMonths(month, -i));
  const series12 = monthlySeries(rows, last12);
  const proj = projection(rows, win.invoiceMonths.at(-1)!, 6);
  // Em aberto até a última parcela: tudo que não foi marcado como pago, inclusive de meses anteriores.
  const open = openPurchases(
    listInstallments(getDb(), user.id, "2000-01", "2099-12", { unpaidOnly: true }).map((r) => ({ ...r, amountCents: convert(r.amountCents) })),
    month,
  );
  const openTotal = open.reduce((x, o) => x + o.remainingCents, 0);
  const overdue = open.reduce((x, o) => x + o.overdueCount, 0);

  const cardSection = (account: CardAccount, index: number) => {
    const s = cardSummary(monthRows, account.id);
    const color = colors[account.id];
    return (
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <span className="w-1 rounded-full" style={{ background: color }} />
              <div>
                <p className="text-xs font-semibold tracking-widest uppercase" style={{ color }}>
                  {account.name}
                </p>
                <p className="text-lg font-semibold">{kindLabel(account)}</p>
                <p className="text-xs text-muted-foreground">
                  {account.closingDay ? `Fecha dia ${account.closingDay}` : "Fechamento não informado"} •{" "}
                  {account.dueDay ? `vence dia ${account.dueDay}` : "vencimento não informado"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs tracking-widest text-muted-foreground uppercase">{single ? "Fatura atual" : "Faturas do período"}</p>
              <p className="text-xl font-semibold tabular-nums" data-testid={`account-total-${index}`}>
                {brl(s.total)}
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {[
              ["Despesas PF", s.pf],
              ["Despesas PJ", s.pj],
              ["Pago", s.paid],
              ["Pendente", s.pending],
            ].map(([label, v]) => (
              <div key={label as string} className="rounded-lg bg-muted/50 px-3 py-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-semibold tabular-nums">{brl(v as number)}</dd>
              </div>
            ))}
          </dl>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Descrição dos custos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {last6.map((m) => {
                const mr = rows.filter((r) => r.invoiceMonth === m && r.accountId === account.id);
                const total = mr.reduce((x, r) => x + r.amountCents, 0);
                return (
                  <TableRow key={m} style={m === month ? { backgroundColor: `${color}1f` } : undefined}>
                    <TableCell className={cn("font-medium", m === month && "font-semibold")}>{monthShort(m)}</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(total)}</TableCell>
                    <TableCell className="text-muted-foreground">{topCategories(mr, 3).join(" • ") || "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {header}

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
        <Indicator
          title="Fatura consolidada"
          value={brl(totals.total)}
          hint={single ? "todas as contas • mês" : "todas as contas • período"}
          color="#4C66DD"
          testId="invoice-total"
        />
        {accounts.map((a) => (
          <Indicator key={a.id} title={a.name} value={brl(totals.byAccount[a.id] ?? 0)} hint={kindLabel(a)} color={colors[a.id]} />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Indicator title="Despesas PF" value={brl(totals.pf)} hint="pela natureza" color={NATURE_COLOR.PF} />
        <Indicator title="Despesas PJ" value={brl(totals.pj)} hint="pela natureza" color={NATURE_COLOR.PJ} />
        <Indicator
          title="Em aberto até a última parcela"
          value={brl(openTotal)}
          hint={overdue ? `${overdue} em atraso` : "nada em atraso"}
          color="#F2A45F"
          testId="open-total"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.8fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Evolução mensal das faturas</CardTitle>
            <p className="text-sm text-muted-foreground">Comparação entre os cartões / contas</p>
          </CardHeader>
          <CardContent>
            <InvoiceBars
              data={monthlySeries(rows, chartMonths(month, period))}
              accounts={accounts.map((a) => ({ id: a.id, name: a.name, color: colors[a.id] }))}
              currency={currency}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Distribuição dos custos</CardTitle>
            <p className="text-sm text-muted-foreground">Composição de despesas • {label}</p>
          </CardHeader>
          <CardContent>
            <CategoryPie
              items={monthRows.map((r) => ({ nature: r.nature, categoryId: r.categoryId, category: r.categoryName, cents: r.amountCents }))}
              currency={currency}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {accounts.map((a, i) => (
          <div key={a.id} className="min-w-0">
            {cardSection(a, i)}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>PF × PJ</CardTitle>
            <p className="text-sm text-muted-foreground">Natureza das despesas • {label}</p>
          </CardHeader>
          <CardContent>
            <NaturePie pf={totals.pf} pj={totals.pj} currency={currency} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Projeção de faturas futuras</CardTitle>
            <p className="text-sm text-muted-foreground">
              Parcelas já cadastradas • {proj.activePurchases} compra{proj.activePurchases === 1 ? "" : "s"} parcelada
              {proj.activePurchases === 1 ? "" : "s"} ativa{proj.activePurchases === 1 ? "" : "s"} • pendente {brl(proj.pendingFuture)}
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  {accounts.map((a) => (
                    <TableHead key={a.id} className="text-center">
                      {a.name}
                    </TableHead>
                  ))}
                  <TableHead className="text-center">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proj.months.map((p) => (
                  <TableRow key={p.month}>
                    <TableCell className="font-medium">{monthShort(p.month)}</TableCell>
                    {accounts.map((a) => (
                      <TableCell key={a.id} className="text-center tabular-nums">
                        {brl(p.byAccount[a.id] ?? 0)}
                      </TableCell>
                    ))}
                    <TableCell className="text-center font-semibold tabular-nums">{brl(p.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Compras em aberto</CardTitle>
          <p className="text-sm text-muted-foreground">
            O que falta pagar de cada compra até a última parcela. Uma parcela só sai daqui quando é marcada como paga em
            Lançamentos: se a de outubro não foi paga, ainda faltam outubro, novembro e dezembro.
          </p>
        </CardHeader>
        <CardContent>
          {open.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma parcela em aberto.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table aria-label="Compras em aberto">
                <TableHeader>
                  <TableRow>
                    <TableHead>Compra</TableHead>
                    <TableHead className="text-center">Cartão / Conta</TableHead>
                    <TableHead className="text-center">Pagas</TableHead>
                    <TableHead className="text-center">Faltam</TableHead>
                    <TableHead className="text-center">Próxima a pagar</TableHead>
                    <TableHead className="text-center">Última parcela</TableHead>
                    <TableHead className="text-center">Valor restante</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {open.map((o) => (
                    <TableRow key={o.expenseId}>
                      <TableCell className="font-medium">{o.description}</TableCell>
                      <TableCell className="text-center">{o.accountName}</TableCell>
                      <TableCell className="text-center tabular-nums">
                        {o.paidCount} / {o.installments}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {o.remainingCount}
                        {o.overdueCount > 0 && (
                          <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-400">
                            {o.overdueCount} em atraso
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{monthLabel(o.nextMonth)}</TableCell>
                      <TableCell className="text-center">{monthLabel(o.lastMonth)}</TableCell>
                      <TableCell className="text-center font-semibold tabular-nums">{brl(o.remainingCents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Consolidado mensal</CardTitle>
          <p className="text-sm text-muted-foreground">
            Soma das contas = Total = Despesas PF + Despesas PJ (duas classificações dos mesmos gastos)
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                {accounts.map((a) => (
                  <TableHead key={a.id} className="text-center">
                    {a.name}
                  </TableHead>
                ))}
                <TableHead className="text-center">Despesas PF</TableHead>
                <TableHead className="text-center">Despesas PJ</TableHead>
                <TableHead className="text-center">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {series12.map((m) => (
                <TableRow key={m.month} className={m.month === month ? "bg-muted/50 font-semibold" : undefined}>
                  <TableCell>{monthLabel(m.month)}</TableCell>
                  {accounts.map((a) => (
                    <TableCell key={a.id} className="text-center tabular-nums">
                      {brl(m.byAccount[a.id] ?? 0)}
                    </TableCell>
                  ))}
                  <TableCell className="text-center tabular-nums">{brl(m.pf)}</TableCell>
                  <TableCell className="text-center tabular-nums">{brl(m.pj)}</TableCell>
                  <TableCell className="text-center font-semibold tabular-nums">{brl(m.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
