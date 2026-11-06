import { createWindowLimiter } from "@/lib/rate-limit";

// Rota de velas: até 8 gráficos por aba, cada um pedindo mais velas ao rolar — limite folgado por pessoa.
const limiter = createWindowLimiter(300, 60_000);

export function allowCandleRequest(userId: number): boolean {
  const key = String(userId);
  if (limiter.limited(key)) return false;
  limiter.hit(key);
  return true;
}

/** Só para testes. */
export function resetCandleRouteLimits(): void {
  limiter.reset();
}
