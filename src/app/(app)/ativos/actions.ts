"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/current";
import { deleteHolding, updateQuantity, upsertHolding } from "@/lib/holdings/holdings";
import { parseQuantity } from "@/lib/validation";

type Result = { ok: true } | { ok: false; error: string };

export async function addHoldingAction(
  coin: { id: string; symbol: string; name: string },
  rawQuantity: string,
): Promise<Result> {
  const user = await requireUser();
  const q = parseQuantity(rawQuantity);
  if (!q.ok) return q;
  if (!coin.id || coin.id.length > 100) return { ok: false, error: "Escolha uma moeda da lista" };
  const r = upsertHolding(getDb(), user.id, {
    coinId: coin.id,
    symbol: coin.symbol.slice(0, 20),
    name: coin.name.slice(0, 100),
    quantity: q.value,
  });
  revalidatePath("/ativos");
  revalidatePath("/");
  return r;
}

export async function updateHoldingAction(holdingId: number, rawQuantity: string): Promise<Result> {
  const user = await requireUser();
  const q = parseQuantity(rawQuantity);
  if (!q.ok) return q;
  if (!updateQuantity(getDb(), user.id, holdingId, q.value)) return { ok: false, error: "Ativo não encontrado" };
  revalidatePath("/ativos");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteHoldingAction(holdingId: number): Promise<Result> {
  const user = await requireUser();
  if (!deleteHolding(getDb(), user.id, holdingId)) return { ok: false, error: "Ativo não encontrado" };
  revalidatePath("/ativos");
  revalidatePath("/");
  return { ok: true };
}
