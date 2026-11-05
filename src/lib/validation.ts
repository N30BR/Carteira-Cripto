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
