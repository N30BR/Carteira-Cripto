/**
 * Ordem do seletor de pares: favoritos primeiro e, dentro de cada grupo, maior capitalização primeiro (posição no
 * CoinMarketCap pela moeda-base); sem posição conhecida, depois e em ordem alfabética do identificador.
 */
export function sortPickItems<T extends { id: string; base: string }>(
  items: T[],
  favorites: ReadonlySet<string>,
  ranks: Record<string, number>,
): T[] {
  const rank = (x: T) =>
    Object.hasOwn(ranks, x.base) ? ranks[x.base] : Number.POSITIVE_INFINITY;
  return [...items].sort(
    (x, y) =>
      Number(favorites.has(y.id)) - Number(favorites.has(x.id)) ||
      rank(x) - rank(y) ||
      x.id.localeCompare(y.id),
  );
}
