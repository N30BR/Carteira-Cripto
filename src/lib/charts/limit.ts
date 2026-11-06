import { createWindowLimiter } from "@/lib/rate-limit";

// Até 120 alterações por minuto por pessoa (desenhar e mexer em indicadores salva com frequência).
// Fica fora do arquivo de actions ("use server"), onde toda função exportada vira chamável pelo navegador.
const limiter = createWindowLimiter(120, 60_000);

export function allowChartChange(userId: number): boolean {
  const key = String(userId);
  if (limiter.limited(key)) return false;
  limiter.hit(key);
  return true;
}

/** Só para testes. */
export function resetChartLimits(): void {
  limiter.reset();
}
