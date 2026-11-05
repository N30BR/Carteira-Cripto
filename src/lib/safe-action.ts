export type ActionResult = { ok: true } | { ok: false; error: string };

/** Chama uma action do servidor; queda de conexão ou erro inesperado vira um resultado com mensagem. */
export async function safeAction<T extends ActionResult>(fn: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await fn();
  } catch {
    return { ok: false, error: "Falha de conexão. Verifique a internet e tente de novo." };
  }
}
