export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(username: string): string | null {
  return /^[a-z0-9._-]{3,32}$/.test(username)
    ? null
    : "Usuário deve ter 3 a 32 caracteres: letras, números, . _ -";
}

export function validatePassword(pw: string): string | null {
  return pw.length >= 8 && pw.length <= 256 ? null : "A senha precisa ter entre 8 e 256 caracteres";
}

export type ParsedQuantity = { ok: true; value: string } | { ok: false; error: string };

/** Aceita "0,5" ou "0.5"; sem separador de milhar; até 15 dígitos inteiros e 18 casas decimais; maior que zero. */
export function parseQuantity(raw: string): ParsedQuantity {
  const s = raw.replace(/\s+/g, "").replace(",", ".");
  if (!/^-?\d{1,15}(\.\d{1,18})?$/.test(s)) return { ok: false, error: "Quantidade inválida" };
  if (s.startsWith("-") || Number(s) <= 0) return { ok: false, error: "Informe uma quantidade maior que zero" };
  return { ok: true, value: s };
}

export function normalizeSearch(raw: string): string | null {
  const q = raw.trim().toLowerCase();
  return q.length >= 2 && q.length <= 50 ? q : null;
}

/**
 * Valor em reais → texto com 2 casas ("5230.50").
 * Com vírgula, pontos são milhar ("5.230,50"); sem vírgula, "1.234.567" é milhar e "5230.50" é decimal.
 */
export function parseBrl(raw: string): ParsedQuantity {
  const invalid = { ok: false as const, error: "Valor inválido" };
  const s = raw.replace(/R\$/gi, "").replace(/\s+/g, "");
  let int: string;
  let dec = "";
  if (s.includes(",")) {
    const parts = s.split(",");
    if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[1])) return invalid;
    if (!/^-?(\d+|\d{1,3}(\.\d{3})+)$/.test(parts[0])) return invalid;
    int = parts[0].replace(/\./g, "");
    dec = parts[1];
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    int = s.replace(/\./g, "");
  } else {
    const m = /^(-?\d+)(?:\.(\d{1,2}))?$/.exec(s);
    if (!m) return invalid;
    int = m[1];
    dec = m[2] ?? "";
  }
  const negative = int.startsWith("-");
  const digits = int.replace("-", "").replace(/^0+(?=\d)/, "");
  if (digits.length > 13) return invalid;
  const cents = dec.padEnd(2, "0");
  const isZero = /^0+$/.test(digits) && /^0+$/.test(cents);
  return { ok: true, value: `${negative && !isZero ? "-" : ""}${digits}.${cents}` };
}

export function validateAccountName(raw: string): ParsedQuantity {
  // Mesmas regras dos outros nomes (controle, invisíveis e inversão de texto não entram).
  const c = cleanLabel(raw);
  if (!c.ok) return { ok: false, error: "O nome tem caracteres não permitidos" };
  const name = c.value;
  return name.length >= 1 && name.length <= 40
    ? { ok: true, value: name }
    : { ok: false, error: "Informe um nome de 1 a 40 caracteres" };
}

const DEFAULT_TZ = "America/Sao_Paulo";

/** Fuso do app (APP_TIMEZONE); valor inválido cai no padrão em vez de derrubar a página. */
export function appTimeZone(raw: string | undefined = process.env.APP_TIMEZONE): string {
  if (!raw) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: raw });
    return raw;
  } catch {
    return DEFAULT_TZ;
  }
}

/** Data de hoje (AAAA-MM-DD) no fuso indicado. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Data AAAA-MM-DD que existe no calendário, entre `min` e `max` (inclusive). */
export function parseIsoDate(raw: string, min: string, max: string): ParsedQuantity {
  const s = raw.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!m || !d || d.toISOString().slice(0, 10) !== s || s < min || s > max) return { ok: false, error: "Data inválida" };
  return { ok: true, value: s };
}

/** Data do saldo: vazio = hoje; formato AAAA-MM-DD válido, entre 2000-01-01 e hoje. */
export function parseBalanceDate(raw: string, today: string): ParsedQuantity {
  const s = raw.trim();
  if (!s) return { ok: true, value: today };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!m || !d || d.toISOString().slice(0, 10) !== s) return { ok: false, error: "Data inválida" };
  if (s < "2000-01-01") return { ok: false, error: "Data inválida" };
  if (s > today) return { ok: false, error: "A data não pode ser no futuro" };
  return { ok: true, value: s };
}

// Não entram: caracteres de controle, de formatação invisíveis (zero-width, inversão de direção, BOM),
// separadores de linha/parágrafo Unicode, preenchimentos invisíveis (Hangul filler) e surrogates soltos.
// Permitidos: junção de emoji (U+200D) e caracteres de tag das bandeiras (ex.: bandeira da Inglaterra).
const FORBIDDEN = /[\p{Cc}\p{Zl}\p{Zp}\p{Cs}\u115F\u1160\u3164\uFFA0]|(?![\u200D\u{E0020}-\u{E007F}])\p{Cf}/u;
const FORBIDDEN_NOTES = /[^\P{Cc}\n]|[\p{Zl}\p{Zp}\p{Cs}\u115F\u1160\u3164\uFFA0]|(?![\u200D\u{E0020}-\u{E007F}])\p{Cf}/gu;
// Pelo menos um caractere visível (um nome só de ZWJ/espaços seria invisível).
const VISIBLE = /[^\s\u200D\uFE0E\uFE0F\u{E0020}-\u{E007F}]/u;

/** Texto curto validado: NFC, sem espaços nas pontas, sem caracteres proibidos e com algo visível. */
function cleanLabel(raw: string): { ok: true; value: string } | { ok: false } {
  const s = raw.normalize("NFC").trim();
  if (FORBIDDEN.test(s) || (s.length > 0 && !VISIBLE.test(s))) return { ok: false };
  return { ok: true, value: s };
}

/** Texto curto (descrição, nome): NFC, sem caracteres invisíveis/de controle, de 1 a `max` caracteres. */
export function validateLabel(raw: string, max: number, what: string): ParsedQuantity {
  const c = cleanLabel(raw);
  if (!c.ok) return { ok: false, error: "O texto tem caracteres não permitidos" };
  const s = c.value;
  return s.length >= 1 && s.length <= max
    ? { ok: true, value: s }
    : { ok: false, error: `Informe ${what} de 1 a ${max} caracteres` };
}

/** Observações: opcionais, até `max` caracteres; quebras de linha permitidas, outros caracteres de controle removidos. */
export function cleanNotes(raw: string, max: number): ParsedQuantity {
  const s = raw
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(FORBIDDEN_NOTES, "")
    .trim();
  return s.length <= max ? { ok: true, value: s } : { ok: false, error: `As observações podem ter até ${max} caracteres` };
}

/** Valor em reais (mesmas regras de parseBrl) → centavos inteiros, maior que zero. */
export function brlToCents(raw: string): { ok: true; value: number } | { ok: false; error: string } {
  const r = parseBrl(raw);
  if (!r.ok) return r;
  const negative = r.value.startsWith("-");
  const [int, dec] = r.value.replace("-", "").split(".");
  const cents = Number(int) * 100 + Number(dec);
  if (negative || cents <= 0) return { ok: false, error: "Informe um valor maior que zero" };
  return { ok: true, value: cents };
}
