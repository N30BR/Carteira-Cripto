// Matemática da escala logarítmica do gráfico (sem dependências do navegador).
//
// O eixo "log" da biblioteca usa log10(1 + preço), quase linear para preços abaixo de 1, e ao
// arrastar soma o deslocamento ao preço comum antes de converter, o que muda a proporção.
// Aqui o eixo usa log10(preço) e guarda a faixa já em log: arrastar desloca em log e mantém a proporção.

const MIN_PRICE = 1e-12;

export const toLog = (price: number): number => Math.log10(Math.max(price, MIN_PRICE));
export const fromLog = (value: number): number => 10 ** value;

export type AxisRange = {
  from: number;
  to: number;
  range: number;
  realFrom: number;
  realTo: number;
  realRange: number;
  displayFrom: number;
  displayTo: number;
  displayRange: number;
};

/** Faixa do eixo a partir dos limites em log: from/to e real* em log; display* em preço. */
export function logRange(logFrom: number, logTo: number): AxisRange {
  const displayFrom = fromLog(logFrom);
  const displayTo = fromLog(logTo);
  return {
    from: logFrom,
    to: logTo,
    range: logTo - logFrom,
    realFrom: logFrom,
    realTo: logTo,
    realRange: logTo - logFrom,
    displayFrom,
    displayTo,
    displayRange: displayTo - displayFrom,
  };
}

/** Valores "redondos" (1, 2, 5 × 10ⁿ) entre min e max, para as marcações do eixo. */
export function logTickValues(min: number, max: number): number[] {
  if (!(min > 0) || !(max > min)) return [];
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
    for (const m of [1, 2, 5]) {
      // Arredonda para não sair 0.30000000000000004.
      const v = Number((m * 10 ** e).toPrecision(12));
      if (v >= min && v <= max) out.push(v);
    }
  }
  return out;
}
