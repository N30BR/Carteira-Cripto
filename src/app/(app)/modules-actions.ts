"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/current";
import { allowModuleChange } from "@/lib/auth/modules";
import { firstActiveHref, type ModuleKey } from "@/lib/modules";
import { setDisabledModules } from "@/lib/modules-store";

type Result = { ok: true; disabled: ModuleKey[]; fallback: string } | { ok: false; error: string };

/** Salva os módulos desligados ("Personalizar abas"). Não apaga nenhum registro. */
export async function setModulesAction(disabled: unknown): Promise<Result> {
  const user = await requireUser();
  if (!allowModuleChange(user.id)) return { ok: false, error: "Muitas alterações seguidas. Aguarde um minuto." };
  const saved = setDisabledModules(getDb(), user.id, disabled);
  revalidatePath("/", "layout");
  return { ok: true, disabled: saved, fallback: firstActiveHref(saved) };
}
