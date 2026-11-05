"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/current";
import { createCategory, deleteCategory, renameCategory, type Result } from "@/lib/cards/categories";
import { planFromForm } from "@/lib/cards/installments";
import { parseMonth } from "@/lib/cards/months";
import { createExpense, deleteExpense, setInstallmentPaid, updateExpense, type Side } from "@/lib/cards/store";
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
  nature: Side;
  card: Side;
  categoryId: number | null;
  currentPaid: boolean;
  notes: string;
};

const NOT_FOUND: Result = { ok: false, error: "Lançamento não encontrado" };
const CAT_NOT_FOUND: Result = { ok: false, error: "Categoria não encontrada" };
const TOO_MANY: Result = { ok: false, error: "Muitas alterações seguidas. Aguarde um minuto." };

const isSide = (v: unknown): v is Side => v === "PF" || v === "PJ";

function refresh() {
  revalidatePath("/lancamentos");
  revalidatePath("/faturas");
}

/** Cria (id null) ou edita uma compra. Tudo que vem do navegador é validado aqui. */
export async function saveExpenseAction(id: number | null, f: ExpenseForm): Promise<Result> {
  const user = await requireUser();
  if (id !== null && !Number.isInteger(id)) return NOT_FOUND;
  if (!allowFiatChange(user.id)) return TOO_MANY;
  if (!f || typeof f !== "object") return { ok: false, error: "Dados inválidos" };

  const description = validateLabel(String(f.description ?? ""), 80, "uma descrição");
  if (!description.ok) return description;
  const cents = brlToCents(String(f.amount ?? ""));
  if (!cents.ok) return cents;
  if (f.mode !== "parcela" && f.mode !== "total") return { ok: false, error: "Escolha se o valor é da parcela ou o total" };
  if (!isSide(f.nature)) return { ok: false, error: "Escolha PF ou PJ" };
  if (!isSide(f.card)) return { ok: false, error: "Escolha o cartão" };
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
    nature: f.nature,
    card: f.card,
    categoryId: f.categoryId,
    notes: notes.value,
    paidNumbers: plan.paidNumbers,
  };
  const r = id === null ? createExpense(getDb(), user.id, input) : updateExpense(getDb(), user.id, id, input);
  refresh();
  return r;
}

export async function deleteExpenseAction(id: number): Promise<Result> {
  const user = await requireUser();
  if (!Number.isInteger(id)) return NOT_FOUND;
  if (!allowFiatChange(user.id)) return TOO_MANY;
  const r = deleteExpense(getDb(), user.id, id);
  refresh();
  return r;
}

export async function toggleInstallmentAction(installmentId: number, paid: boolean): Promise<Result> {
  const user = await requireUser();
  if (!Number.isInteger(installmentId) || typeof paid !== "boolean") return NOT_FOUND;
  if (!allowFiatChange(user.id)) return TOO_MANY;
  const r = setInstallmentPaid(getDb(), user.id, installmentId, paid);
  refresh();
  return r;
}

export async function createCategoryAction(rawName: string): Promise<Result> {
  const user = await requireUser();
  if (!allowFiatChange(user.id)) return TOO_MANY;
  const name = validateLabel(String(rawName ?? ""), 40, "um nome");
  if (!name.ok) return name;
  const r = createCategory(getDb(), user.id, name.value);
  refresh();
  return r;
}

export async function renameCategoryAction(id: number, rawName: string): Promise<Result> {
  const user = await requireUser();
  if (!Number.isInteger(id)) return CAT_NOT_FOUND;
  if (!allowFiatChange(user.id)) return TOO_MANY;
  const name = validateLabel(String(rawName ?? ""), 40, "um nome");
  if (!name.ok) return name;
  const r = renameCategory(getDb(), user.id, id, name.value);
  refresh();
  return r;
}

export async function deleteCategoryAction(id: number): Promise<Result> {
  const user = await requireUser();
  if (!Number.isInteger(id)) return CAT_NOT_FOUND;
  if (!allowFiatChange(user.id)) return TOO_MANY;
  const r = deleteCategory(getDb(), user.id, id);
  refresh();
  return r;
}
