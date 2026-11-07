/**
 * Pedido vindo do próprio site? (defesa extra contra CSRF nas rotas que mudam estado; o cookie já é SameSite=Lax.)
 * Aceita o host do pedido, o host repassado pelo proxy e o domínio configurado (APP_DOMAIN).
 * Sem cabeçalho Origin, confere o Sec-Fetch-Site (o navegador sempre o envia; não dá para forjar de outro site).
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      return false;
    }
    const allowed = [request.headers.get("host"), request.headers.get("x-forwarded-host"), process.env.APP_DOMAIN].filter(Boolean);
    return allowed.includes(host);
  }
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin" || site === "none";
}
