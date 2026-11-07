"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireModule } from "@/lib/auth/modules";
import { addToHolding, deleteHolding, updateQuantity, upsertHolding } from "@/lib/holdings/holdings";
import { isListedAsset } from "@/lib/prices";
import { coinName } from "@/lib/prices/coin-names";
import { parseQuantity } from "@/lib/validation";

type Result = { ok: true } | { ok: false; error: string };

function refresh() {
  revalidatePath("/ativos");
  revalidatePath("/");
}

export async function addHoldingAction(coinId: string, rawQuantity: string): Promise<Result> {
  const user = await requireModule("crypto");
  if (typeof coinId !== "string" || !/^[A-Z0-9]{1,20}$/.test(coinId)) {
    return { ok: false, error: "Escolha uma moeda da lista" };
  }
  const q = parseQuantity(String(rawQuantity ?? ""));
  if (!q.ok) return q;
  const db = getDb();
  const listed = await isListedAsset(db, coinId);
  if (listed === null) return { ok: false, error: "Não foi possível consultar a Binance agora. Tente de novo em instantes." };
  if (!listed) return { ok: false, error: "Moeda não encontrada na Binance" };

  // Símbolo e nome definidos aqui, não pelo navegador.
  const r = upsertHolding(db, user.id, { coinId, symbol: coinId, name: coinName(coinId), quantity: q.value });
  refresh();
  return r;
}

export async function updateHoldingAction(holdingId: number, rawQuantity: string): Promise<Result> {
  const user = await requireModule("crypto");
  const q = parseQuantity(String(rawQuantity ?? ""));
  if (!q.ok) return q;
  if (!Number.isInteger(holdingId) || !updateQuantity(getDb(), user.id, holdingId, q.value)) {
    return { ok: false, error: "Ativo não encontrado" };
  }
  refresh();
  return { ok: true };
}

/** "+Transação": soma uma quantidade a uma cripto que já está no portfólio. */
export async function addTransactionAction(holdingId: number, rawQuantity: string): Promise<{ ok: true; quantity: string } | { ok: false; error: string }> {
  const user = await requireModule("crypto");
  if (!Number.isInteger(holdingId)) return { ok: false, error: "Escolha uma moeda do portfólio" };
  const q = parseQuantity(String(rawQuantity ?? ""));
  if (!q.ok) return q;
  const r = addToHolding(getDb(), user.id, holdingId, q.value);
  if (r.ok) refresh();
  return r;
}

export async function deleteHoldingAction(holdingId: number): Promise<Result> {
  const user = await requireModule("crypto");
  if (!Number.isInteger(holdingId) || !deleteHolding(getDb(), user.id, holdingId)) {
    return { ok: false, error: "Ativo não encontrado" };
  }
  refresh();
  return { ok: true };
}
