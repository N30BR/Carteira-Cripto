import type { RefCurrency } from "@/lib/currency";
import { PERIOD_OPTIONS, type Period } from "@/lib/portfolio/calc";
import { CurrencyMenu } from "@/components/dashboard/currency-menu";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { MonthPicker } from "@/components/month-picker";

/**
 * Cabeçalho de Faturas, Transações e Resumo: título com a moeda ao lado; à direita, o período
 * (1D a 1A) e o mês de referência, que é o início do período.
 */
export function PeriodHeader({
  title,
  subtitle,
  eyebrow,
  currency,
  requested,
  cookieName,
  period,
  path,
  month,
  warning,
}: {
  title: string;
  subtitle: React.ReactNode;
  eyebrow?: string;
  currency: RefCurrency;
  requested: RefCurrency;
  cookieName: string;
  period: Period;
  path: string;
  month: string;
  warning?: string | null;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        {eyebrow && <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">{eyebrow}</p>}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <CurrencyMenu current={currency} cookieName={cookieName} />
        </div>
        <div className="text-sm text-muted-foreground">{subtitle}</div>
        {warning && <p className="text-xs text-amber-400">{warning}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PeriodSelector options={PERIOD_OPTIONS} current={period} path={path} query={{ moeda: requested, mes: month }} />
        <MonthPicker month={month} />
      </div>
    </div>
  );
}
