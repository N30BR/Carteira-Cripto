/** Cookie do modo discreto (vale para todas as abas; lido no servidor para a página já vir escondida). */
export const DISCREET_COOKIE = "modo-discreto";

export function isDiscreet(value: string | undefined): boolean {
  return value === "1";
}
