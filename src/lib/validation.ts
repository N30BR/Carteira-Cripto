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
