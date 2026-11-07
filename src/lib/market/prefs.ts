// Período global da aba Cripto (cliente e servidor).
export const GLOBAL_PERIODS = ["1D", "1S", "1M", "6M", "1A"] as const;
export type GlobalPeriod = (typeof GLOBAL_PERIODS)[number];
export const PERIOD_DAYS: Record<GlobalPeriod, number> = { "1D": 1, "1S": 7, "1M": 30, "6M": 182, "1A": 365 };
/** Cookie do período escolhido (lido pelo servidor, como nas outras abas). */
export const PERIOD_COOKIE = "bh_cripto_periodo";
export const parsePeriod = (v: string | undefined): GlobalPeriod => ((GLOBAL_PERIODS as readonly string[]).includes(v ?? "") ? (v as GlobalPeriod) : "1M");
