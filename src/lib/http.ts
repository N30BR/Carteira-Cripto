// Busca JSON (ou texto) de fontes externas com tempo limite e teto de tamanho (a resposta é tratada como não confiável).
// O corpo é lido aos poucos e a leitura é cortada ao passar do teto (vale também sem content-length e com
// corpo comprimido, que chega já descomprimido). Redirecionamentos são recusados.

async function fetchBytesCapped(url: string, maxBytes: number, label: string, timeoutMs: number, accept: string, headers: Record<string, string> = {}): Promise<Uint8Array> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(timeoutMs), headers: { ...headers, Accept: accept } });
  } catch {
    throw new Error(`${label} indisponível`);
  }
  if (!res.ok) throw new Error(`${label} ${res.status}`);
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`${label}: resposta grande demais`);
  if (!res.body) throw new Error(`${label}: resposta vazia`);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error(`${label}: resposta grande demais`);
      }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof Error && e.message.endsWith("grande demais")) throw e;
    throw new Error(`${label} indisponível`);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return bytes;
}

/** headers: cabeçalhos extras (ex.: chave de API do servidor; nunca vão para mensagens de erro). */
export async function fetchJsonCapped(url: string, maxBytes: number, label: string, timeoutMs = 20_000, headers?: Record<string, string>): Promise<unknown> {
  const bytes = await fetchBytesCapped(url, maxBytes, label, timeoutMs, "application/json", headers);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new Error(`${label}: resposta inválida`);
  }
}

/** Texto (ex.: CSV), com as mesmas proteções. */
export async function fetchTextCapped(url: string, maxBytes: number, label: string, timeoutMs = 20_000): Promise<string> {
  return new TextDecoder().decode(await fetchBytesCapped(url, maxBytes, label, timeoutMs, "text/csv, text/plain"));
}
