"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireModule } from "@/lib/auth/modules";
import { MAX_TOTAL_CENTS } from "@/lib/cards/installments";
import { allowFiatChange } from "@/lib/fiat/limit";
import { createTransaction, deleteTransaction, updateTransaction, type Result, type TxKind } from "@/lib/transactions/store";
import { brlToCents, parseIsoDate, validateLabel } from "@/lib/validation";

export type TransactionForm = { date: string; kind: TxKind; description: string; amount: string };

const NOT_FOUND: Result = { ok: false, error: "Transação não encontrada" };
const TOO_MANY: Result = { ok: false, error: "Muitas alterações seguidas. Aguarde um minuto." };

function refresh() {
  revalidatePath("/lancamentos");
  revalidatePath("/transacoes");
  revalidatePath("/resumo");
}

/** Cria (id null) ou edita uma transação. Tudo que vem do navegador é validado aqui. */
export async function saveTransactionAction(id: number | null, f: TransactionForm): Promise<Result> {
  const user = await requireModule("transactions");
  if (id !== null && !Number.isInteger(id)) return NOT_FOUND;
  if (!allowFiatChange(user.id)) return TOO_MANY;
  if (!f || typeof f !== "object") return { ok: false, error: "Dados inválidos" };

  const date = parseIsoDate(String(f.date ?? ""), "2000-01-01", "2099-12-31");
  if (!date.ok) return date;
  if (f.kind !== "in" && f.kind !== "out") return { ok: false, error: "Escolha Entrada ou Saída" };
  const description = validateLabel(String(f.description ?? ""), 80, "uma descrição");
  if (!description.ok) return description;
  const cents = brlToCents(String(f.amount ?? ""));
  if (!cents.ok) return cents;
  // Teto por valor (o mesmo das compras): mantém as somas exatas em centavos.
  if (cents.value > MAX_TOTAL_CENTS) return { ok: false, error: "Valor muito alto" };

  const input = { date: date.value, kind: f.kind, description: description.value, amountCents: cents.value };
  const r = id === null ? createTransaction(getDb(), user.id, input) : updateTransaction(getDb(), user.id, id, input);
  refresh();
  return r;
}

export async function deleteTransactionAction(id: number): Promise<Result> {
  const user = await requireModule("transactions");
  if (!Number.isInteger(id)) return NOT_FOUND;
  if (!allowFiatChange(user.id)) return TOO_MANY;
  const r = deleteTransaction(getDb(), user.id, id);
  refresh();
  return r;
}
