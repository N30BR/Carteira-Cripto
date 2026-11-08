// Endereço público do dashboard para montar links enviados por e-mail.
// Nunca usa o cabeçalho Host do pedido (pode ser forjado): só a configuração do servidor.
//   APP_URL   = https://seu-dominio (preferido)   ou   APP_DOMAIN = seu-dominio (vira https://seu-dominio)
// Em produção, exige HTTPS. Em desenvolvimento, sem configuração, usa http://localhost:PORT.
export function appBaseUrl(): string | null {
  const explicit = process.env.APP_URL?.trim();
  const domain = process.env.APP_DOMAIN?.trim();
  const raw = explicit || (domain ? `https://${domain}` : "");
  const prod = process.env.NODE_ENV === "production";
  if (raw) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      return null;
    }
    // Em produção só HTTPS (exceto testes locais de produção com COOKIE_SECURE=false).
    if (prod && u.protocol !== "https:" && process.env.COOKIE_SECURE !== "false") return null;
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `${u.protocol}//${u.host}`;
  }
  if (prod) return null;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}
