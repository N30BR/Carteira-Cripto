// Só do servidor: depende de @/lib/auth/current (server-only).
import { cache } from "react";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { createWindowLimiter } from "@/lib/rate-limit";
import { firstActiveHref, type ModuleKey } from "@/lib/modules";
import { getDisabledModules } from "@/lib/modules-store";
import { requireUser } from "./current";

/** Usuário e módulos desligados (uma leitura por requisição). */
export const getModuleState = cache(async () => {
  const user = await requireUser();
  const disabled = getDisabledModules(getDb(), user.id);
  return { user, disabled, on: (key: ModuleKey) => !disabled.includes(key) };
});

/**
 * Exige login e o módulo ligado. Desligado: vai para a primeira aba ativa.
 * Usado nas páginas e nas actions do módulo (bloqueia também acesso pela URL direta).
 */
export async function requireModule(key: ModuleKey) {
  const state = await getModuleState();
  if (!state.on(key)) redirect(firstActiveHref(state.disabled));
  return state.user;
}

/** Para rotas de API (sem redirecionar): o módulo está ligado para este usuário? */
export function moduleOn(userId: number, key: ModuleKey): boolean {
  return !getDisabledModules(getDb(), userId).includes(key);
}

const limiter = createWindowLimiter(30, 60_000);
export function allowModuleChange(userId: number): boolean {
  const k = String(userId);
  if (limiter.limited(k)) return false;
  limiter.hit(k);
  return true;
}
export function resetModuleLimits(): void {
  limiter.reset();
}
