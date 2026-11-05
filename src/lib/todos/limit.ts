import { createWindowLimiter } from "@/lib/rate-limit";

// Até 120 alterações por minuto por pessoa (marcar itens de checklist gera muitos cliques).
// Fica fora do arquivo de actions ("use server"), onde toda função exportada vira chamável pelo navegador.
const limiter = createWindowLimiter(120, 60_000);

export function allowTodoChange(userId: number): boolean {
  const key = String(userId);
  if (limiter.limited(key)) return false;
  limiter.hit(key);
  return true;
}

/** Só para testes. */
export function resetTodoLimits(): void {
  limiter.reset();
}
