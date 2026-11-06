// Configuração central dos módulos que o usuário pode ligar ou desligar ("Personalizar abas").
// Lançamentos e Ativos ficam sempre visíveis; Admin segue a regra de administrador; /sobre é fixa.
// Desligar um módulo só esconde e tira das contas: nenhum registro é apagado.

export const MODULE_KEYS = ["crypto", "fiat", "invoices", "transactions", "summary", "charts", "todos"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export type ModuleInfo = { key: ModuleKey; label: string; menuLabel: string; href: string };

/** Na ordem da barra de navegação. */
export const MODULES: ModuleInfo[] = [
  { key: "crypto", label: "Cripto", menuLabel: "Cripto", href: "/" },
  { key: "fiat", label: "R$", menuLabel: "R$ / Fiduciário", href: "/fiduciario" },
  { key: "invoices", label: "Faturas", menuLabel: "Faturas", href: "/faturas" },
  { key: "transactions", label: "Transações", menuLabel: "Transações", href: "/transacoes" },
  { key: "summary", label: "Resumo", menuLabel: "Resumo", href: "/resumo" },
  { key: "charts", label: "Gráficos", menuLabel: "Gráficos", href: "/graficos" },
  { key: "todos", label: "Pendências", menuLabel: "Pendências", href: "/pendencias" },
];

/**
 * Evento disparado antes de salvar a personalização: telas com salvamento pendente (ex.: Gráficos)
 * enviam o que falta enquanto o módulo ainda está ligado. As actions rodam na ordem em que são chamadas.
 */
export const FLUSH_PENDING_EVENT = "bh:flush-pending";

/** Para onde ir quando a aba atual foi desligada: a primeira ativa, ou Lançamentos. */
export function firstActiveHref(disabled: readonly ModuleKey[]): string {
  return MODULES.find((m) => !disabled.includes(m.key))?.href ?? "/lancamentos";
}

/** Módulo dono da rota (inclui subpáginas); null para rotas que não podem ser desligadas. */
export function moduleForPath(pathname: string): ModuleKey | null {
  if (pathname === "/") return "crypto";
  const m = MODULES.find((x) => x.href !== "/" && (pathname === x.href || pathname.startsWith(`${x.href}/`)));
  return m?.key ?? null;
}

/** Lista salva validada: só chaves conhecidas, sem repetição, na ordem da barra. */
export function sanitizeDisabled(raw: unknown): ModuleKey[] {
  if (!Array.isArray(raw)) return [];
  return MODULE_KEYS.filter((k) => raw.includes(k));
}
