// Função central do Resumo: indicadores, painel, gráficos, tabela e faixa de totais usam só este resultado.
//
// Saldo cripto e saldo em reais são posições (fotografia do patrimônio); faturas e transações são
// movimentos do mês. Sem conciliação entre eles, o resultado é uma composição nominal
// (estimativa): uma despesa que já baixou o saldo da conta seria contada de novo.

export type ComponentKey = "crypto" | "fiat" | "invoices" | "inflow" | "outflow";

export type SummaryInput = {
  /** Saldo cripto em centavos de real; null quando não há cotação para converter. */
  cryptoCents: number | null;
  /** Saldo das contas em reais, em centavos; null quando não há contas. */
  fiatCents: number | null;
  /** Faturas do mês (parcelas do mês), em centavos. */
  invoicesCents: number;
  inflowCents: number;
  outflowCents: number;
};

export type SummaryComponent = {
  key: ComponentKey;
  label: string;
  /** Valor com sinal (+ soma, − subtrai); null quando indisponível. */
  signedCents: number | null;
  /** Participação sobre a soma dos valores absolutos; null sem base ou indisponível. */
  share: number | null;
  classification: string;
  note: string;
};

export type Summary = {
  components: SummaryComponent[];
  positive: number;
  negative: number;
  result: number;
  /** Componentes que ficaram fora da conta por falta de dado. */
  missing: ComponentKey[];
};

const META: Record<ComponentKey, { label: string; kind: "balance" | "invoice" | "flow"; note: string }> = {
  crypto: { label: "Saldo Cripto", kind: "balance", note: "Saldo patrimonial" },
  fiat: { label: "Saldo Fiduciário", kind: "balance", note: "Saldo em reais" },
  invoices: { label: "Faturas", kind: "invoice", note: "Compromissos do mês" },
  inflow: { label: "Entradas de Transações", kind: "flow", note: "Movimentações positivas" },
  outflow: { label: "Saídas de Transações", kind: "flow", note: "Movimentações negativas" },
};

function classify(key: ComponentKey, signed: number | null): string {
  const kind = META[key].kind;
  const sign = signed !== null && signed < 0 ? "(−)" : "(+)";
  if (kind === "balance") return `Saldo patrimonial ${sign}`;
  if (kind === "invoice") return "Fatura do mês (−)";
  return key === "inflow" ? "Entrada de transação (+)" : "Saída de transação (−)";
}

export function consolidate(input: SummaryInput): Summary {
  const signed: Record<ComponentKey, number | null> = {
    crypto: input.cryptoCents === null ? null : Math.round(input.cryptoCents),
    fiat: input.fiatCents === null ? null : Math.round(input.fiatCents),
    invoices: -input.invoicesCents,
    inflow: input.inflowCents,
    outflow: -input.outflowCents,
  };
  const keys = Object.keys(META) as ComponentKey[];
  const absTotal = keys.reduce((s, k) => s + Math.abs(signed[k] ?? 0), 0);

  let positive = 0;
  let negative = 0;
  for (const k of keys) {
    const v = signed[k];
    if (v === null) continue;
    if (v > 0) positive += v;
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
        classification: classify(key, v),
        note: META[key].note,
      };
    }),
    positive,
    negative,
    result: positive - negative,
    missing: keys.filter((k) => signed[k] === null),
  };
}
