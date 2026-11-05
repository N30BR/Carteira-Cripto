import { createWindowLimiter } from "@/lib/rate-limit";

// Até 60 alterações por minuto por pessoa: impede encher o banco com milhares de saldos de uma vez.
// Fica fora do arquivo de actions ("use server"), onde toda função exportada vira chamável pelo navegador.
const limiter = createWindowLimiter(60, 60_000);

/** Registra a alteração; false quando a pessoa passou do limite. */
export function allowFiatChange(userId: number): boolean {
  const key = String(userId);
  if (limiter.limited(key)) return false;
  limiter.hit(key);
  return true;
}

/** Só para testes. */
export function resetFiatLimits(): void {
  limiter.reset();
}
