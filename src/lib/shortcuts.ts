// Registro central dos atalhos de teclado que existem no app.
// A página "Atalhos" documenta a partir daqui e a aba Gráficos usa as mesmas definições para reconhecer as teclas.
// Só entra aqui o que funciona de verdade.
import type { ModuleKey } from "./modules";

export type ShortcutSection = "charts" | "invoices" | "todos" | "tables";
export type Shortcut = {
  id: string;
  section: ShortcutSection;
  /** Teclas como aparecem (cada item é uma tecla). */
  keys: string[];
  action: string;
  description: string;
  /** Quando o atalho vale. */
  when: string;
  /** Teclas reconhecidas pela aba Gráficos (só para os atalhos tratados por nós). */
  match?: { key: string; ctrl?: boolean; shift?: boolean };
};

/** Seções da página Atalhos; aparecem só se algum dos módulos estiver ligado. */
export const SHORTCUT_SECTIONS: { id: ShortcutSection; label: string; modules: ModuleKey[] }[] = [
  { id: "charts", label: "Gráficos", modules: ["charts"] },
  { id: "invoices", label: "Lançamentos", modules: ["invoices"] },
  { id: "todos", label: "Pendências", modules: ["todos"] },
  { id: "tables", label: "Cripto e R$", modules: ["crypto", "fiat"] },
];

export const SHORTCUTS: Shortcut[] = [
  {
    id: "charts.delete",
    section: "charts",
    keys: ["Delete"],
    action: "Excluir objeto",
    description: "Exclui o desenho selecionado no gráfico.",
    when: "Com um desenho selecionado e o foco no gráfico (não em campos de texto).",
    match: { key: "Delete" },
  },
  {
    id: "charts.duplicate",
    section: "charts",
    keys: ["Ctrl", "D"],
    action: "Duplicar objeto",
    description: "Cria uma cópia do desenho selecionado, com o mesmo tipo, estilo e posição.",
    when: "Com um desenho selecionado e o foco no gráfico. Substitui o \"favoritar página\" do navegador só nesse caso.",
    match: { key: "d", ctrl: true },
  },
  {
    id: "charts.hide",
    section: "charts",
    keys: ["Ctrl", "O"],
    action: "Ocultar objeto",
    description: "Esconde o desenho selecionado sem apagar (volta pela lista de desenhos).",
    when: "Com um desenho selecionado e o foco no gráfico. Substitui o \"abrir arquivo\" do navegador só nesse caso.",
    match: { key: "o", ctrl: true },
  },
  {
    id: "charts.cancel",
    section: "charts",
    keys: ["Esc"],
    action: "Cancelar ferramenta / tirar seleção",
    description: "Cancela o desenho em andamento (volta a mover o gráfico) ou tira a seleção do desenho.",
    when: "Com uma ferramenta de desenho ativa ou um desenho selecionado.",
    match: { key: "Escape" },
  },
  {
    id: "charts.scrollLeft",
    section: "charts",
    keys: ["Shift", "←"],
    action: "Rolar para a esquerda",
    description: "Move o gráfico para velas mais antigas.",
    when: "Na aba Gráficos, fora de campos de texto (vale para todas as divisões).",
  },
  {
    id: "charts.scrollRight",
    section: "charts",
    keys: ["Shift", "→"],
    action: "Rolar para a direita",
    description: "Move o gráfico para velas mais recentes.",
    when: "Na aba Gráficos, fora de campos de texto (vale para todas as divisões).",
  },
  {
    id: "charts.zoomIn",
    section: "charts",
    keys: ["Shift", "+"],
    action: "Aproximar",
    description: "Aumenta o zoom horizontal (velas mais largas).",
    when: "Na aba Gráficos, fora de campos de texto (vale para todas as divisões).",
  },
  {
    id: "charts.zoomOut",
    section: "charts",
    keys: ["Shift", "−"],
    action: "Afastar",
    description: "Diminui o zoom horizontal (mais velas na tela).",
    when: "Na aba Gráficos, fora de campos de texto (vale para todas as divisões).",
  },
  {
    id: "invoices.confirmDay",
    section: "invoices",
    keys: ["Enter"],
    action: "Confirmar dia",
    description: "Confirma o dia de fechamento ou de vencimento digitado do cartão.",
    when: "Com o cursor no campo do dia.",
  },
  {
    id: "todos.save",
    section: "todos",
    keys: ["Enter"],
    action: "Salvar campo",
    description: "Salva o campo da pendência que está sendo editado.",
    when: "Editando um campo nos detalhes da pendência.",
  },
  {
    id: "todos.cancel",
    section: "todos",
    keys: ["Esc"],
    action: "Cancelar edição",
    description: "Sai da edição do campo sem salvar.",
    when: "Editando um campo nos detalhes da pendência.",
  },
  {
    id: "tables.closeColumns",
    section: "tables",
    keys: ["Esc"],
    action: "Fechar menu de colunas",
    description: "Fecha o menu de escolha das colunas das tabelas.",
    when: "Com o menu de colunas aberto (tabelas de Cripto e R$).",
  },
];

/** O evento de teclado corresponde ao atalho? (Ctrl ou ⌘ valem igual.) */
export function matches(e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }, id: string): boolean {
  const m = SHORTCUTS.find((s) => s.id === id)?.match;
  if (!m) return false;
  const ctrl = e.ctrlKey || e.metaKey;
  return e.key.toLowerCase() === m.key.toLowerCase() && ctrl === !!m.ctrl && e.shiftKey === !!m.shift && !e.altKey;
}

/** Busca por ação, teclas ou descrição (sem diferenciar maiúsculas e acentos). */
export function searchShortcuts(list: Shortcut[], q: string): Shortcut[] {
  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const t = norm(q.trim());
  if (!t) return list;
  return list.filter((s) => norm([s.action, s.description, s.keys.join(" + "), s.keys.join("+"), s.when].join(" ")).includes(t));
}

/** Seções da página Atalhos com os atalhos de cada uma; some a seção sem atalhos ou com os módulos desligados. */
export function shortcutSections(disabled: readonly ModuleKey[]) {
  return SHORTCUT_SECTIONS.filter((s) => s.modules.some((m) => !disabled.includes(m)))
    .map((s) => ({ ...s, shortcuts: SHORTCUTS.filter((x) => x.section === s.id) }))
    .filter((s) => s.shortcuts.length > 0);
}
