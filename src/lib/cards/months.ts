// Meses no formato "AAAA-MM".
const NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

/** "2025-05" → "Mai/2025" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${NAMES[m - 1]}/${y}`;
}

/** "2026-11" → "NOV/26" */
export function monthShort(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${NAMES[m - 1].toUpperCase()}/${String(y).slice(2)}`;
}

/** Mês válido entre 2000-01 e 2099-12, ou null. */
export function parseMonth(raw: unknown): string | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}$/.test(raw)) return null;
  const [y, m] = raw.split("-").map(Number);
  return y >= 2000 && y <= 2099 && m >= 1 && m <= 12 ? raw : null;
}

/** "AAAA-MM-DD" → "AAAA-MM" */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}
