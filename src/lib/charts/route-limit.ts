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

// Rota de séries macro (FRED): poucas séries, em cache de 6 h.
const macroLimiter = createWindowLimiter(60, 60_000);

export function allowMacroRequest(userId: number): boolean {
  const key = String(userId);
  if (macroLimiter.limited(key)) return false;
  macroLimiter.hit(key);
  return true;
}

/** Só para testes. */
export function resetMacroRouteLimits(): void {
  macroLimiter.reset();
}

// Rota de open interest (Binance Futures), em cache de 5 min.
const oiLimiter = createWindowLimiter(60, 60_000);

export function allowOpenInterestRequest(userId: number): boolean {
  const key = String(userId);
  if (oiLimiter.limited(key)) return false;
  oiLimiter.hit(key);
  return true;
}

/** Só para testes. */
export function resetOpenInterestRouteLimits(): void {
  oiLimiter.reset();
}

// Rota on-chain (Coin Metrics e BGeometrics), em cache de 12–24 h.
const onchainLimiter = createWindowLimiter(60, 60_000);

export function allowOnchainRequest(userId: number): boolean {
  const key = String(userId);
  if (onchainLimiter.limited(key)) return false;
  onchainLimiter.hit(key);
  return true;
}

/** Só para testes. */
export function resetOnchainRouteLimits(): void {
  onchainLimiter.reset();
}

// Rota de séries de mercado (capitalização e dominância), em cache de 10–60 min.
const marketLimiter = createWindowLimiter(60, 60_000);

export function allowMarketRequest(userId: number): boolean {
  const key = String(userId);
  if (marketLimiter.limited(key)) return false;
  marketLimiter.hit(key);
  return true;
}

/** Só para testes. */
export function resetMarketRouteLimits(): void {
  marketLimiter.reset();
}
