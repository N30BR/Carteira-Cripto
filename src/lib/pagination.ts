// Paginação das listas (função pura).

/** Páginas mostradas: a primeira, a última e as vizinhas da atual (null = "…"). */
export function pageWindow(page: number, pages: number): (number | null)[] {
  const keep = new Set([0, pages - 1, page - 1, page, page + 1].filter((p) => p >= 0 && p < pages));
  const out: (number | null)[] = [];
  [...keep].sort((a, b) => a - b).forEach((p, i, list) => {
    if (i > 0 && p - list[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
}
