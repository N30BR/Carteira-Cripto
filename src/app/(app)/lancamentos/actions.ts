"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireModule } from "@/lib/auth/modules";
import { createCardAccount, deleteCardAccount, setCardClosingDay, setCardDueDay, updateCardAccount, type Side } from "@/lib/cards/accounts";
import { createCategory, deleteCategory, renameCategory, type Result } from "@/lib/cards/categories";
import { planFromForm } from "@/lib/cards/installments";
import { parseMonth } from "@/lib/cards/months";
import { closeMonth, createExpense, deleteExpense, previewMonthClose, setInstallmentPaid, setInstallmentSettled, updateExpense, type MonthClosePreview } from "@/lib/cards/store";
import { allowFiatChange } from "@/lib/fiat/limit";
import { appTimeZone, brlToCents, cleanNotes, parseBalanceDate, todayIn, validateLabel } from "@/lib/validation";

export type ExpenseForm = {
  description: string;
  amount: string;
  mode: "parcela" | "total";
  current: number;
  total: number;
  refMonth: string;
  purchaseDate: string;
  /** Conta/cartão (id); o tipo PF/PJ vem da conta. */
  accountId: number;
  categoryId: number | null;
  currentPaid: boolean;
  notes: string;
};

const NOT_FOUND: Result = { ok: false, error: "Lançamento não encontrado" };
const CAT_NOT_FOUND: Result = { ok: false, error: "Categoria não encontrada" };
const ACCOUNT_NOT_FOUND: Result = { ok: false, error: "Conta não encontrada" };
const TOO_MANY: Result = { ok: false, error: "Muitas alterações seguidas. Aguarde um minuto." };

const isSide = (v: unknown): v is Side => v === "PF" || v === "PJ";

function refresh() {
  revalidatePath("/lancamentos");
  revalidatePath("/faturas");
  revalidatePath("/resumo");
  // Parcela paga desconta da conta do R$ (o saldo dela muda).
  revalidatePath("/fiduciario");
  revalidatePath("/ativos");
}

/** Cria (id null) ou edita uma compra. Tudo que vem do navegador é validado aqui. */
export async function saveExpenseAction(id: number | null, f: ExpenseForm): Promise<Result> {
  const user = await requireModule("invoices");
  if (id !== null && !Number.isInteger(id)) return NOT_FOUND;
  if (!allowFiatChange(user.id)) return TOO_MANY;
  if (!f || typeof f !== "object") return { ok: false, error: "Dados inválidos" };

  const description = validateLabel(String(f.description ?? ""), 80, "uma descrição");
  if (!description.ok) return description;
  const cents = brlToCents(String(f.amount ?? ""));
  if (!cents.ok) return cents;
  if (f.mode !== "parcela" && f.mode !== "total") return { ok: false, error: "Escolha se o valor é da parcela ou o total" };
  if (!Number.isInteger(f.accountId)) return { ok: false, error: "Escolha o cartão / conta" };
  const refMonth = parseMonth(f.refMonth);
  if (!refMonth) return { ok: false, error: "Mês de referência inválido" };
  const date = parseBalanceDate(String(f.purchaseDate ?? ""), todayIn(appTimeZone()));
  if (!date.ok) return date;
  const notes = cleanNotes(String(f.notes ?? ""), 500);
  if (!notes.ok) return notes;
  if (f.categoryId !== null && !Number.isInteger(f.categoryId)) return { ok: false, error: "Categoria inválida" };

  const plan = planFromForm({
    amountCents: cents.value,
    mode: f.mode,
    current: Number(f.current),
    total: Number(f.total),
    refMonth,
    currentPaid: f.currentPaid === true,
  });
  if (!plan.ok) return plan;

  const input = {
    description: description.value,
    totalCents: plan.totalCents,
    installments: plan.installments,
    firstInvoice: plan.firstInvoice,
    purchaseDate: date.value,
    accountId: f.accountId,
    categoryId: f.categoryId,
    notes: notes.value,
    amountMode: f.mode,
    paidNumbers: plan.paidNumbers,
  };
  const today = todayIn(appTimeZone());
  const r = id === null ? createExpense(getDb(), user.id, input, today) : updateExpense(getDb(), user.id, id, input, today);
  refresh();
  return r;
}

export async function deleteExpenseAction(id: number): Promise<Result> {
  const user = await requireModule("invoices");
  if (!Number.isInteger(id)) return NOT_FOUND;
  if (!allowFiatChange(user.id)) return TOO_MANY;
  const r = deleteExpense(getDb(), user.id, id);
  refresh();
  return r;
}

export async function toggleInstallmentAction(installmentId: number, paid: boolean): Promise<Result> {
  const user = await requireModule("invoices");
  if (!Number.isInteger(installmentId) || typeof paid !== "boolean") return NOT_FOUND;
  if (!allowFiatChange(user.id)) return TOO_MANY;
  const r = setInstallmentPaid(getDb(), user.id, installmentId, paid, todayIn(appTimeZone()));
  refresh();
  return r;
}

/** Quitada: encerra a parcela sem mexer no saldo (exclusiva com "paga"). */
export async function settleInstallmentAction(installmentId: number, settled: boolean): Promise<Result> {
  const user = await requireModule("invoices");
  if (!Number.isInteger(installmentId) || typeof settled !== "boolean") return NOT_FOUND;
  if (!allowFiatChange(user.id)) return TOO_MANY;
  const r = setInstallmentSettled(getDb(), user.id, installmentId, settled);
  refresh();
  return r;
}

/** Resumo do fechamento mensal (para a confirmação): parcelas em aberto do mês, total e contas afetadas. */
export async function previewMonthCloseAction(rawMonth: string): Promise<({ ok: true } & MonthClosePreview) | { ok: false; error: string }> {
  const user = await requireModule("invoices");
  const month = parseMonth(rawMonth);
  if (!month) return { ok: false, error: "Mês inválido" };
  return { ok: true, ...previewMonthClose(getDb(), user.id, month) };
}

/** Fechamento mensal: paga (desconta) ou quita (sem mexer em saldo) todas as parcelas em aberto do mês. */
export async function closeMonthAction(rawMonth: string, mode: "paid" | "settled"): Promise<Result & { count?: number }> {
  const user = await requireModule("invoices");
  const month = parseMonth(rawMonth);
  if (!month) return { ok: false, error: "Mês inválido" };
  if (mode !== "paid" && mode !== "settled") return { ok: false, error: "Ação inválida" };
  if (!allowFiatChange(user.id)) return TOO_MANY;
  const r = closeMonth(getDb(), user.id, month, mode, todayIn(appTimeZone()));
  refresh();
  return r;
}

export async function createCategoryAction(rawName: string): Promise<Result> {
  const user = await requireModule("invoices");
  if (!allowFiatChange(user.id)) return TOO_MANY;
  const name = validateLabel(String(rawName ?? ""), 40, "um nome");
  if (!name.ok) return name;
  const r = createCategory(getDb(), user.id, name.value);
  refresh();
  return r;
}

export async function renameCategoryAction(id: number, rawName: string): Promise<Result> {
  const user = await requireModule("invoices");
  if (!Number.isInteger(id)) return CAT_NOT_FOUND;
  if (!allowFiatChange(user.id)) return TOO_MANY;
  const name = validateLabel(String(rawName ?? ""), 40, "um nome");
  if (!name.ok) return name;
  const r = renameCategory(getDb(), user.id, id, name.value);
  refresh();
  return r;
}

export async function deleteCategoryAction(id: number): Promise<Result> {
  const user = await requireModule("invoices");
  if (!Number.isInteger(id)) return CAT_NOT_FOUND;
  if (!allowFiatChange(user.id)) return TOO_MANY;
  const r = deleteCategory(getDb(), user.id, id);
  refresh();
  return r;
}

export async function createCardAccountAction(rawName: string, kind: Side): Promise<Result> {
  const user = await requireModule("invoices");
  if (!allowFiatChange(user.id)) return TOO_MANY;
  if (!isSide(kind)) return { ok: false, error: "Escolha PF ou PJ" };
  const name = validateLabel(String(rawName ?? ""), 30, "um nome");
  if (!name.ok) return name;
  const r = createCardAccount(getDb(), user.id, { name: name.value, kind });
  refresh();
  return r;
}

export async function updateCardAccountAction(id: number, rawName: string, kind: Side): Promise<Result> {
  const user = await requireModule("invoices");
  if (!Number.isInteger(id)) return ACCOUNT_NOT_FOUND;
  if (!allowFiatChange(user.id)) return TOO_MANY;
  if (!isSide(kind)) return { ok: false, error: "Escolha PF ou PJ" };
  const name = validateLabel(String(rawName ?? ""), 30, "um nome");
  if (!name.ok) return name;
  const r = updateCardAccount(getDb(), user.id, id, { name: name.value, kind });
  refresh();
  return r;
}

export async function deleteCardAccountAction(id: number): Promise<Result> {
  const user = await requireModule("invoices");
  if (!Number.isInteger(id)) return ACCOUNT_NOT_FOUND;
  if (!allowFiatChange(user.id)) return TOO_MANY;
  const r = deleteCardAccount(getDb(), user.id, id);
  refresh();
  return r;
}

/** Dia de vencimento da fatura de uma conta (1–31); null limpa. */
export async function setCardDueDayAction(id: number, day: number | null): Promise<Result> {
  const user = await requireModule("invoices");
  if (!Number.isInteger(id)) return ACCOUNT_NOT_FOUND;
  if (!allowFiatChange(user.id)) return TOO_MANY;
  if (day !== null && typeof day !== "number") return { ok: false, error: "O vencimento deve ser um dia de 1 a 31" };
  const r = setCardDueDay(getDb(), user.id, id, day);
  refresh();
  return r;
}

/** Dia de fechamento da fatura de uma conta (1–31); null limpa. */
export async function setCardClosingDayAction(id: number, day: number | null): Promise<Result> {
  const user = await requireModule("invoices");
  if (!Number.isInteger(id)) return ACCOUNT_NOT_FOUND;
  if (!allowFiatChange(user.id)) return TOO_MANY;
  if (day !== null && typeof day !== "number") return { ok: false, error: "O fechamento deve ser um dia de 1 a 31" };
  const r = setCardClosingDay(getDb(), user.id, id, day);
  refresh();
  return r;
}
