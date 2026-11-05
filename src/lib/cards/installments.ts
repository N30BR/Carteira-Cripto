import { addMonths } from "./months";

export const MAX_INSTALLMENTS = 48;
export const MAX_TOTAL_CENTS = 100_000_000_000; // R$ 1 bilhão

/** Divide o total em n parcelas; a diferença de centavos fica na última. */
export function splitCents(totalCents: number, n: number): number[] {
  const base = Math.floor(totalCents / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? totalCents - base * (n - 1) : base));
}

export type PlannedInstallment = { number: number; invoiceMonth: string; amountCents: number };

export function buildInstallments(totalCents: number, n: number, firstInvoice: string): PlannedInstallment[] {
  return splitCents(totalCents, n).map((amountCents, i) => ({
    number: i + 1,
    invoiceMonth: addMonths(firstInvoice, i),
    amountCents,
  }));
}

export type FormPlan =
  | { ok: true; totalCents: number; installments: number; firstInvoice: string; paidNumbers: number[] }
  | { ok: false; error: string };

/**
 * Interpreta o formulário: valor (da parcela ou total), parcela "atual/total" no mês de referência
 * e o status da parcela atual. As anteriores contam como pagas; as futuras, pendentes.
 */
export function planFromForm(input: {
  amountCents: number;
  mode: "parcela" | "total";
  current: number;
  total: number;
  refMonth: string;
  currentPaid: boolean;
}): FormPlan {
  const { amountCents, mode, current, total, refMonth, currentPaid } = input;
  if (!Number.isInteger(total) || total < 1 || total > MAX_INSTALLMENTS) {
    return { ok: false, error: `O total de parcelas deve ser de 1 a ${MAX_INSTALLMENTS}` };
  }
  if (!Number.isInteger(current) || current < 1) return { ok: false, error: "Parcela atual inválida" };
  if (current > total) return { ok: false, error: "A parcela atual não pode passar do total" };
  const totalCents = mode === "parcela" ? amountCents * total : amountCents;
  if (Number.isSafeInteger(totalCents) && totalCents > MAX_TOTAL_CENTS) return { ok: false, error: "Valor muito alto" };
  if (!Number.isSafeInteger(totalCents) || totalCents < total) {
    return { ok: false, error: "Valor muito baixo para esse número de parcelas" };
  }
  const paidNumbers = Array.from({ length: currentPaid ? current : current - 1 }, (_, i) => i + 1);
  return { ok: true, totalCents, installments: total, firstInvoice: addMonths(refMonth, -(current - 1)), paidNumbers };
}
