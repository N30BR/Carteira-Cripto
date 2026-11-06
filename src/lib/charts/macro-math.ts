// Funções puras das séries comparadas (sem dependências: usadas no servidor e no navegador).
export type Point = [timestamp: number, value: number];

/** Observações do FRED → [data em ms, valor]; "." (sem dado) é ignorado. */
export function parseFredObservations(json: unknown): Point[] {
  const obs = (json as { observations?: unknown })?.observations;
  if (!Array.isArray(obs)) throw new Error("FRED: resposta inesperada");
  const out: Point[] = [];
  for (const o of obs as { date?: unknown; value?: unknown }[]) {
    const t = typeof o.date === "string" ? Date.parse(`${o.date}T00:00:00Z`) : NaN;
    const v = typeof o.value === "string" && o.value !== "." ? Number(o.value) : NaN;
    if (Number.isFinite(t) && Number.isFinite(v)) out.push([t, v]);
  }
  return out;
}

/** Valor de cada instante = último ponto da série até ele (em degrau); antes do primeiro ponto = null. */
export function alignStep(points: Point[], timestamps: number[]): (number | null)[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  let i = -1;
  return [...timestamps]
    .map((t, idx) => ({ t, idx }))
    .sort((a, b) => a.t - b.t)
    .map(({ t, idx }) => {
      while (i + 1 < sorted.length && sorted[i + 1][0] <= t) i++;
      return { idx, v: i >= 0 ? sorted[i][1] : null };
    })
    .sort((a, b) => a.idx - b.idx)
    .map((x) => x.v);
}

export type Part = { points: Point[]; scale: number; fx?: Point[]; fxMode?: "multiply" | "divide" };

/** Soma de partes (com escala e câmbio) nas datas da primeira parte; datas sem algum dado ficam de fora. */
export function combine(parts: Part[]): Point[] {
  const dates = parts[0].points.map((p) => p[0]);
  const aligned = parts.map((p) => ({ v: alignStep(p.points, dates), fx: p.fx ? alignStep(p.fx, dates) : null, p }));
  const out: Point[] = [];
  dates.forEach((t, i) => {
    let sum = 0;
    for (const a of aligned) {
      const v = a.v[i];
      if (v === null) return;
      let x = v * a.p.scale;
      if (a.fx) {
        const fx = a.fx[i];
        if (fx === null || fx === 0) return;
        x = a.p.fxMode === "divide" ? x / fx : x * fx;
      }
      sum += x;
    }
    out.push([t, sum]);
  });
  return out;
}

/** Rebase: a série começa no mesmo valor do preço (primeiro ponto com dado) e segue as próprias variações. */
export function rebase(values: (number | null)[], closes: number[]): (number | null)[] {
  const first = values.findIndex((v) => v !== null && v !== 0);
  if (first < 0) return values.map(() => null);
  const factor = closes[first] / (values[first] as number);
  return values.map((v) => (v === null ? null : v * factor));
}

