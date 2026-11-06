// Busca JSON de fontes externas com tempo limite e teto de tamanho (a resposta é tratada como não confiável).

export async function fetchJsonCapped(url: string, maxBytes: number, label: string, timeoutMs = 20_000): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs), headers: { Accept: "application/json" } });
  } catch {
    throw new Error(`${label} indisponível`);
  }
  if (!res.ok) throw new Error(`${label} ${res.status}`);
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`${label}: resposta grande demais`);
  const text = await res.text();
  if (text.length > maxBytes) throw new Error(`${label}: resposta grande demais`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label}: resposta inválida`);
  }
}
