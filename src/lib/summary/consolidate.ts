// Função central do Resumo: indicadores, painel, gráficos, tabela e faixa de totais usam só este resultado.
//
// Saldo cripto (no início do período), saldo em reais e a variação cripto do período são patrimônio:
// entram neutros, nem entrada nem saída (saldo inicial + variação = saldo cripto no fim).
// Entradas de transações somam; faturas e saídas de transações subtraem.
// Sem conciliação entre saldos e movimentos, o resultado é uma composição nominal (estimativa).
// Valores em unidades mínimas da moeda escolhida (centavos; satoshis em BTC).

export type ComponentKey = "crypto" | "fiat" | "invoices" | "inflow" | "outflow" | "variation";
export type Tone = "neutral" | "in" | "out";

export type SummaryInput = {
  /** Saldo cripto no início do período; null sem preço/cotação. */
  cryptoCents: number | null;
  /** Saldo das contas em reais; null quando indisponível. */
  fiatCents: number | null;
  /** Faturas (parcelas) dos meses do período. */
  invoicesCents: number;
  inflowCents: number;
  outflowCents: number;
  /** Valorização (+) ou desvalorização (−) da carteira cripto no período; null sem histórico. */
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
  crypto: { label: "Saldo Cripto", note: "Saldo no início do período" },
  fiat: { label: "Saldo Fiduciário", note: "Saldo em reais" },
  invoices: { label: "Faturas", note: "Compromissos do período" },
  inflow: { label: "Entradas de Transações", note: "Movimentações positivas" },
  outflow: { label: "Saídas de Transações", note: "Movimentações negativas" },
  variation: { label: "Variação Cripto", note: "Valorização no período" },
};

function describe(key: ComponentKey, v: number | null): { tone: Tone; classification: string } {
  if (key === "crypto" || key === "fiat") return { tone: "neutral", classification: "Saldo patrimonial (neutro)" };
  if (key === "invoices") return { tone: "out", classification: "Fatura do período (−)" };
  if (key === "inflow") return { tone: "in", classification: "Entrada de transação (+)" };
  if (key === "outflow") return { tone: "out", classification: "Saída de transação (−)" };
  return { tone: "neutral", classification: `Variação patrimonial ${(v ?? 0) < 0 ? "(−)" : "(+)"}` };
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
  const absTotal = keys.reduce((s, k) => s + Math.abs(signed[k] ?? 0), 0);

  let neutral = 0;
  let positive = 0;
  let negative = 0;
  for (const k of keys) {
    const v = signed[k];
    if (v === null) continue;
    const { tone } = describe(k, v);
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
        share: v === null || absTotal <= 0 ? null : Math.abs(v) / absTotal,
        ...describe(key, v),
        note: key === "variation" && (v ?? 0) < 0 ? "Desvalorização no período" : META[key].note,
      };
    }),
    neutral,
    positive,
    negative,
    result: neutral + positive - negative,
    missing: keys.filter((k) => signed[k] === null),
  };
}
