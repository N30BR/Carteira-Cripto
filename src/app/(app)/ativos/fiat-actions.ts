"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/current";
import { createAccount, deleteAccount, renameAccount, setBalance, type Result } from "@/lib/fiat/accounts";
import { parseBalanceDate, parseBrl, todayIn, validateAccountName } from "@/lib/validation";

const NOT_FOUND: Result = { ok: false, error: "Conta não encontrada" };

function today(): string {
  return todayIn(process.env.APP_TIMEZONE ?? "America/Sao_Paulo");
}

function refresh() {
  revalidatePath("/ativos");
  revalidatePath("/fiduciario");
}

/** Valor e data digitados → valores prontos, ou a primeira mensagem de erro. */
function parseBalance(rawAmount: unknown, rawDate: unknown): { ok: false; error: string } | { ok: true; amount: string; date: string } {
  const amount = parseBrl(String(rawAmount ?? ""));
  if (!amount.ok) return amount;
  const date = parseBalanceDate(String(rawDate ?? ""), today());
  if (!date.ok) return date;
  return { ok: true, amount: amount.value, date: date.value };
}

export async function createAccountAction(rawName: string, rawAmount: string, rawDate: string): Promise<Result> {
  const user = await requireUser();
  const name = validateAccountName(String(rawName ?? ""));
  if (!name.ok) return name;
  const b = parseBalance(rawAmount, rawDate);
  if (!b.ok) return b;
  const r = createAccount(getDb(), user.id, { name: name.value, amount: b.amount, date: b.date });
  refresh();
  return r;
}

export async function setBalanceAction(accountId: number, rawAmount: string, rawDate: string): Promise<Result> {
  const user = await requireUser();
  if (!Number.isInteger(accountId)) return NOT_FOUND;
  const b = parseBalance(rawAmount, rawDate);
  if (!b.ok) return b;
  const r = setBalance(getDb(), user.id, accountId, { amount: b.amount, date: b.date });
  refresh();
  return r;
}

export async function renameAccountAction(accountId: number, rawName: string): Promise<Result> {
  const user = await requireUser();
  if (!Number.isInteger(accountId)) return NOT_FOUND;
  const name = validateAccountName(String(rawName ?? ""));
  if (!name.ok) return name;
  const r = renameAccount(getDb(), user.id, accountId, name.value);
  refresh();
  return r;
}

export async function deleteAccountAction(accountId: number): Promise<Result> {
  const user = await requireUser();
  if (!Number.isInteger(accountId)) return NOT_FOUND;
  const r = deleteAccount(getDb(), user.id, accountId);
  refresh();
  return r;
}
