// Função central do Resumo: indicadores, painel, gráficos, tabela e faixa de totais usam só este resultado.
//
// Saldo cripto (total atual) e saldo em reais são patrimônio: entram neutros, nem entrada nem saída.
// Entradas de transações somam; faturas e saídas de transações subtraem.
// A variação cripto do período é só informativa (comparação no tempo): o saldo atual já a inclui,
// então ela não entra em nenhuma soma nem na participação.
// Sem conciliação entre saldos e movimentos, o resultado é uma composição nominal (estimativa).
// Valores em unidades mínimas da moeda escolhida (centavos; satoshis em BTC).

export type ComponentKey = "crypto" | "fiat" | "invoices" | "inflow" | "outflow" | "variation";
export type Tone = "neutral" | "in" | "out" | "info";

export type SummaryInput = {
  /** Saldo cripto total atual; null sem preço/cotação. */
  cryptoCents: number | null;
  /** Saldo das contas em reais; null quando indisponível. */
  fiatCents: number | null;
  /** Faturas (parcelas) dos meses do período. */
  invoicesCents: number;
  inflowCents: number;
  outflowCents: number;
  /** Valorização (+) ou desvalorização (−) da carteira no período, só informativa; null sem histórico. */
  cryptoVariationCents?: number | null;
};

export type SummaryComponent = {
  key: ComponentKey;
  label: string;
  /** Valor com sinal; null quando indisponível. */
  signedCents: number | null;
  /** Neutro (saldo), entrada (+) ou saída (−). */
  tone: Tone;
  /** Participação sobre a soma dos valores absolutos; null sem base ou indisponível. */
  share: number | null;
  classification: string;
  note: string;
};

export type Summary = {
  components: SummaryComponent[];
  /** Soma dos saldos (neutros). */
  neutral: number;
  positive: number;
  negative: number;
  /** neutral + positive − negative */
  result: number;
  missing: ComponentKey[];
};

const META: Record<ComponentKey, { label: string; note: string }> = {
  crypto: { label: "Saldo Cripto", note: "Saldo total atual" },
  fiat: { label: "Saldo Fiduciário", note: "Saldo em reais" },
  invoices: { label: "Faturas", note: "Compromissos do período" },
  inflow: { label: "Entradas de Transações", note: "Movimentações positivas" },
  outflow: { label: "Saídas de Transações", note: "Movimentações negativas" },
  variation: { label: "Variação Cripto", note: "Comparação no período; já incluída no saldo cripto" },
};

function describe(key: ComponentKey): { tone: Tone; classification: string } {
  if (key === "crypto" || key === "fiat") return { tone: "neutral", classification: "Saldo patrimonial (neutro)" };
  if (key === "invoices") return { tone: "out", classification: "Fatura do período (−)" };
  if (key === "inflow") return { tone: "in", classification: "Entrada de transação (+)" };
  if (key === "outflow") return { tone: "out", classification: "Saída de transação (−)" };
  return { tone: "info", classification: "Informativa (não contabilizada)" };
}

export function consolidate(input: SummaryInput): Summary {
  const round = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v));
  const signed: Record<ComponentKey, number | null> = {
    crypto: round(input.cryptoCents),
    fiat: round(input.fiatCents),
    invoices: -Math.round(input.invoicesCents),
    inflow: Math.round(input.inflowCents),
    outflow: -Math.round(input.outflowCents),
    variation: input.cryptoVariationCents === undefined ? 0 : round(input.cryptoVariationCents),
  };
  const keys = Object.keys(META) as ComponentKey[];
  const counted = keys.filter((k) => k !== "variation");
  const absTotal = counted.reduce((s, k) => s + Math.abs(signed[k] ?? 0), 0);

  let neutral = 0;
  let positive = 0;
  let negative = 0;
  for (const k of counted) {
    const v = signed[k];
    if (v === null) continue;
    const { tone } = describe(k);
    if (tone === "neutral") neutral += v;
    else if (v > 0) positive += v;
    else negative += -v;
  }

  return {
    components: keys.map((key) => {
      const v = signed[key];
      return {
        key,
        label: META[key].label,
        signedCents: v,
        share: v === null || key === "variation" || absTotal <= 0 ? null : Math.abs(v) / absTotal,
        ...describe(key),
        note: META[key].note,
      };
    }),
    neutral,
    positive,
    negative,
    result: neutral + positive - negative,
    missing: keys.filter((k) => signed[k] === null),
  };
}
