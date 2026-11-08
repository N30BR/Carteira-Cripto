"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { FLUSH_PENDING_EVENT } from "@/lib/modules";
import { AlignRight, ArrowDown, ArrowUp, Eye, EyeOff, Flame, LayoutGrid, ListTree, Magnet, Plus, Search, Settings2, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  createChartTabAction,
  deleteChartTabAction,
  renameChartTabAction,
  saveChartPrefsAction,
  saveChartTabAction,
} from "@/app/(app)/graficos/actions";
import { CHART_QUOTES, pairLabel, type ChartInterval } from "@/lib/charts/params";
import { INVERTED_PAIRS, MARKET_SERIES, instrumentLabel, isMarketId } from "@/lib/market/ids";
import type { ChartTab } from "@/lib/charts/store";
import {
  CHART_INDICATORS,
  CHART_LAYOUTS,
  CHART_TOOLS,
  LIMITS,
  paneFromTemplate,
  templateOf,
  type ChartLayout,
  type ChartScale,
  type ChartType,
  type CompareState,
  type IndicatorState,
  type OverlayState,
  type PaneState,
  type PaneTemplate,
  type TabState,
  type ToolPrefs,
  withView,
} from "@/lib/charts/workspace";
import { MACRO_SERIES } from "@/lib/charts/macro-ids";
import { ONCHAIN_SERIES } from "@/lib/charts/onchain-ids";
import { safeAction } from "@/lib/safe-action";
import { matches } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import type { CompareAction, IndicatorAction, PaneHandle } from "./chart-pane";
import { CompareSettingsDialog, compareLabel } from "./compare-ui";
import { compareDisplay } from "@/lib/charts/compare";
import { IndicatorMenu, IndicatorSettingsDialog, indicatorLabel, newIndicatorId, type Figure, type MenuTarget } from "./indicator-ui";
import { ColorPicker, ObjectSettingsDialog, ObjectToolbar, ObjectsDialog, WidthMenu } from "./object-ui";
import { COMPARE_COLORS } from "@/lib/charts/colors";
import { FavoritesBar, IntervalBar, ToolGroups } from "./toolbar";

// O gráfico usa o canvas do navegador: carregado só no cliente.
const ChartPane = dynamic(() => import("./chart-pane").then((m) => m.ChartPane), { ssr: false });

export type SymbolOption = { symbol: string; base: string; quote: string };

const TYPE_LABEL: Record<ChartType, string> = { candle: "Velas", ohlc: "Barras", area: "Área", line: "Linha" };
const SCALE_LABEL: Record<ChartScale, string> = { normal: "Normal", logarithm: "Log", percentage: "%" };
// Atalhos de período (rodapé): escolhem o tempo do gráfico que cobre esse período.
const RANGES: { label: string; interval: ChartInterval }[] = [
  { label: "1D", interval: "5m" },
  { label: "5D", interval: "15m" },
  { label: "1M", interval: "1h" },
  { label: "3M", interval: "4h" },
  { label: "6M", interval: "1d" },
  { label: "YTD", interval: "1d" },
  { label: "1A", interval: "1d" },
  { label: "5A", interval: "1w" },
  { label: "Tudo", interval: "1M" },
];
const GRID: Record<ChartLayout, string> = { 1: "grid-cols-1", 2: "grid-cols-1 md:grid-cols-2", 4: "grid-cols-2 grid-rows-2", 8: "grid-cols-2 grid-rows-4 md:grid-cols-4 md:grid-rows-2" };
const TOOL_LABEL = Object.fromEntries(CHART_TOOLS.map((t) => [t.name, t.label]));
const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Indicadores e desenhos antigos (sem id) ganham um, para menus, cópias e seleção. */
function withIds(state: TabState): TabState {
  const missing = state.panes.some((p) => p.indicators.some((i) => !i.id) || p.overlays.some((o) => !o.id));
  if (!missing) return state;
  return {
    ...state,
    panes: state.panes.map((p) => ({
      ...p,
      indicators: p.indicators.map((i) => (i.id ? i : { ...i, id: uid("i") })),
      overlays: p.overlays.map((o) => (o.id ? o : { ...o, id: uid("d") })),
    })),
  };
}

/**
 * Título da aba: o par do 1º gráfico (ex.: BTC/USDT) e "+N" se os outros gráficos da divisão mostram pares diferentes;
 * se a pessoa renomeou a aba, vale o nome dela. `full` (dica ao passar o mouse) lista todos os pares.
 */
function tabTitle(t: ChartTab): { label: string; full: string } {
  const pairs = [...new Set(t.state.panes.slice(0, t.state.layout).map((p) => instrumentLabel(p.symbol, pairLabel)))];
  const auto = pairs.length > 1 ? `${pairs[0]} +${pairs.length - 1}` : (pairs[0] ?? t.name);
  const label = /^Gráfico \d+$/.test(t.name) ? auto : t.name;
  return { label, full: label === pairs.join(", ") ? label : `${label} (${pairs.join(", ")})` };
}

/** O foco está num campo de texto (aí os atalhos do gráfico não valem)? */
const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

function Seg<T extends string | number>({ value, options, onChange, label, render }: { value: T; options: readonly T[]; onChange: (v: T) => void; label: string; render: (v: T) => string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          aria-pressed={o === value}
          onClick={() => onChange(o)}
          className={cn("rounded px-2 py-1 text-muted-foreground hover:text-foreground", o === value && "bg-muted font-semibold text-foreground")}
        >
          {render(o)}
        </button>
      ))}
    </div>
  );
}

type Sel = { pane: number; id: string };

export function ChartWorkspace({
  initialTabs,
  initialPrefs,
  symbols,
  portfolio = [],
  openSymbol = null,
}: {
  initialTabs: ChartTab[];
  initialPrefs: { tools: ToolPrefs; activeTabId: number | null };
  symbols: SymbolOption[];
  /** Pares dos ativos do Portfólio (ex.: SOLUSDT), para o Comparar. */
  portfolio?: string[];
  /** "Abrir em Gráficos" (aba Cripto): instrumento a abrir numa aba nova. */
  openSymbol?: string | null;
}) {
  const [tabs, setTabs] = useState(() => initialTabs.map((t) => ({ ...t, state: withIds(t.state) })));
  const [activeId, setActiveId] = useState(
    initialTabs.some((t) => t.id === initialPrefs.activeTabId) ? (initialPrefs.activeTabId as number) : initialTabs[0].id,
  );
  const [tools, setTools] = useState(initialPrefs.tools);
  const [activePane, setActivePane] = useState(0);
  const [magnet, setMagnet] = useState(false);
  const [hideDrawings, setHideDrawings] = useState(false);
  const [hideIndicators, setHideIndicators] = useState(false);
  const [dialog, setDialog] = useState<null | "symbol" | "indicators" | "tools" | "compare" | "objects">(null);
  // Desenho selecionado (barra rápida), desenho com as configurações abertas e ferramenta em uso.
  const [selected, setSelected] = useState<Sel | null>(null);
  const [settingsFor, setSettingsFor] = useState<Sel | null>(null);
  const [drawing, setDrawing] = useState<{ pane: number; tool: string } | null>(null);
  // Menu e configurações de indicador (ícones ao lado do nome).
  const [indMenu, setIndMenu] = useState<(MenuTarget & { pane: number }) | null>(null);
  const [indSettings, setIndSettings] = useState<{ pane: number; index: number; figures: Figure[] } | null>(null);
  // Configurações de uma comparação (ícone na legenda).
  const [cmpSettings, setCmpSettings] = useState<{ pane: number; index: number } | null>(null);
  // Avisos por janela (o aviso de uma janela não apaga o de outra).
  const [errors, setErrors] = useState<Record<number, string | null>>({});
  const error = Object.values(errors).filter(Boolean).join(" · ") || null;
  const handles = useRef<(PaneHandle | null)[]>([]);
  const root = useRef<HTMLDivElement>(null);
  // O último clique foi dentro do gráfico? (atalhos só valem no contexto do gráfico)
  const focusInside = useRef(false);
  // Um salvamento pendente por aba: editar outra aba não cancela o da primeira.
  const pending = useRef(new Map<number, { timer: ReturnType<typeof setTimeout>; state: TabState }>());

  const tab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const paneIndex = Math.min(activePane, tab.state.panes.length - 1);
  const pane = tab.state.panes[paneIndex];

  function flushSave(id: number) {
    const job = pending.current.get(id);
    if (!job) return;
    clearTimeout(job.timer);
    pending.current.delete(id);
    void safeAction(() => saveChartTabAction(id, job.state)).then((r) => {
      if (!r.ok) toast.error(r.error);
    });
  }
  // Salva a aba na conta ~1 s depois da última mudança (estados consolidados, não cada movimento).
  function scheduleSave(id: number, state: TabState) {
    clearTimeout(pending.current.get(id)?.timer);
    // Tela bloqueada por inatividade: o salvamento espera o desbloqueio (o servidor recusaria agora e nada se perde).
    const run = () => (document.documentElement.hasAttribute("data-locked") ? pending.current.set(id, { state, timer: setTimeout(run, 3000) }) : flushSave(id));
    pending.current.set(id, { state, timer: setTimeout(run, 1000) });
  }
  // Mudança numa divisão (usa o estado mais recente: o gráfico avisa de desenhos a qualquer momento).
  function updatePaneOf(tabId: number, index: number, patch: Partial<PaneState> | ((p: PaneState) => Partial<PaneState>)) {
    setTabs((list) =>
      list.map((t) => {
        if (t.id !== tabId) return t;
        const state = { ...t.state, panes: t.state.panes.map((p, i) => (i === index ? { ...p, ...(typeof patch === "function" ? patch(p) : patch) } : p)) };
        scheduleSave(tabId, state);
        return { ...t, state };
      }),
    );
  }
  const updatePane = (patch: Partial<PaneState>, index = paneIndex) => updatePaneOf(tab.id, index, patch);
  function updateTab(next: TabState) {
    setTabs((list) => list.map((t) => (t.id === tab.id ? { ...t, state: next } : t)));
    scheduleSave(tab.id, next);
  }

  function savePrefs(nextTools: ToolPrefs, nextActive: number) {
    void safeAction(() => saveChartPrefsAction(nextTools, nextActive));
  }
  // ---------- Modelo para gráficos novos ----------
  // Referência: o 1º gráfico da aba de origem (no começo, a 1ª aba). Mudou a configuração dele → o modelo
  // (salvo nas preferências) acompanha. Fechada a aba de origem, o último modelo continua valendo.
  // O modelo só é aplicado ao CRIAR um gráfico (nova aba ou mais divisões); depois cada um é independente.
  const sourceTabId = tools.template?.sourceTabId ?? tabs[0].id;
  const sourceTab = tabs.find((t) => t.id === sourceTabId);
  const sourcePane = sourceTab ? (sourceTab.state.panes[tools.template?.sourcePane ?? 0] ?? sourceTab.state.panes[0]) : null;
  const sourceKey = sourceTab && sourcePane ? JSON.stringify(templateOf(sourcePane, sourceTab.id, tools.template?.sourcePane)) : null;
  const toolsRef = useRef(tools);
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    toolsRef.current = tools;
    activeIdRef.current = activeId;
  });
  useEffect(() => {
    if (!sourceKey || sourceKey === JSON.stringify(toolsRef.current.template ?? null)) return;
    // Espera a pessoa terminar de mexer (~1,5 s) antes de salvar.
    const timer = setTimeout(() => {
      const next = { ...toolsRef.current, template: JSON.parse(sourceKey) as PaneTemplate };
      setTools(next);
      savePrefs(next, activeIdRef.current);
    }, 1500);
    return () => clearTimeout(timer);
  }, [sourceKey]);
  /** Gráfico novo com o modelo (indicadores e estilos, tipo, escala, exibição); o par é o do gráfico selecionado. */
  const newPane = (symbol: string) => paneFromTemplate(symbol, tools.template ?? (sourcePane ? templateOf(sourcePane) : undefined), () => uid("i"));
  /** Usa o gráfico selecionado como modelo para os próximos (passa a ser a referência). */
  const useAsTemplate = () => {
    changePrefs({ ...tools, template: templateOf(pane, tab.id, paneIndex) });
    toast("Modelo atualizado: os próximos gráficos abrem com esta configuração.");
  };

  const changePrefs = (next: ToolPrefs) => {
    setTools(next);
    savePrefs(next, tab.id);
  };
  // Ao sair da página (ou esconder a aba do navegador), salva o que estiver pendente em vez de descartar.
  const flushAll = useRef(() => {});
  useEffect(() => {
    flushAll.current = () => {
      for (const id of [...pending.current.keys()]) flushSave(id);
    };
  });
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flushAll.current();
    const onLeave = () => flushAll.current();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onLeave);
    // "Personalizar abas" pede para salvar antes de desligar o módulo (senão o salvamento seria recusado).
    window.addEventListener(FLUSH_PENDING_EVENT, onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener(FLUSH_PENDING_EVENT, onLeave);
      flushAll.current();
    };
  }, []);

  // ---------- Desenho selecionado ----------
  const selectedObject = selected ? (tab.state.panes[selected.pane]?.overlays.find((o) => o.id === selected.id) ?? null) : null;
  const settingsObject = settingsFor ? (tab.state.panes[settingsFor.pane]?.overlays.find((o) => o.id === settingsFor.id) ?? null) : null;
  const objectOps = (sel: Sel) => {
    const h = handles.current[sel.pane];
    return {
      update: (patch: Partial<OverlayState>) => h?.updateOverlay(sel.id, patch),
      settings: () => setSettingsFor(sel),
      duplicate: () => {
        const copy = h?.duplicateOverlay(sel.id);
        if (copy) setSelected({ pane: sel.pane, id: copy });
      },
      hide: () => {
        h?.updateOverlay(sel.id, { visible: false });
        h?.deselect(); // também tira os pontos de controle do desenho oculto
        toast("Desenho oculto. Para mostrar de novo, use a lista de desenhos.");
      },
      remove: () => {
        h?.removeOverlay(sel.id);
        setSelected(null);
      },
      order: (to: "front" | "back" | "forward" | "backward") => h?.orderOverlay(sel.id, to),
    };
  };

  // Atalhos (Delete, Ctrl+D, Ctrl+O, Esc): só no contexto do gráfico e fora de campos de texto.
  const keyState = useRef({ selected, drawing, dialog, settingsFor, indSettings, cmpSettings });
  useEffect(() => {
    keyState.current = { selected, drawing, dialog, settingsFor, indSettings, cmpSettings };
  });
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      focusInside.current = !!root.current?.contains(e.target as Node);
    };
    const onKey = (e: KeyboardEvent) => {
      const k = keyState.current;
      // Janela ou menu aberto: as teclas são deles (o Esc que fecha uma janela não tira a seleção).
      const overlayOpen = !!document.querySelector('[role="dialog"][data-state="open"], [role="menu"][data-state="open"]');
      if (typing(e.target) || overlayOpen || k.dialog || k.settingsFor || k.indSettings || k.cmpSettings || !focusInside.current) return;
      if (matches(e, "charts.cancel")) {
        if (k.drawing && handles.current[k.drawing.pane]?.cancelDraw()) return;
        if (k.selected) handles.current[k.selected.pane]?.deselect();
        return;
      }
      if (!k.selected) return;
      const ops = objectOps(k.selected);
      if (matches(e, "charts.delete")) {
        e.preventDefault();
        ops.remove();
      } else if (matches(e, "charts.duplicate")) {
        e.preventDefault();
        ops.duplicate();
      } else if (matches(e, "charts.hide")) {
        e.preventDefault();
        ops.hide();
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    // Na captura: roda antes de a janela aberta tratar (e fechar com) o Esc.
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, []);

  function selectTab(id: number) {
    setActiveId(id);
    setActivePane(0);
    setSelected(null);
    savePrefs(tools, id);
  }

  /** Aba nova (com o modelo dos gráficos novos). symbol: o instrumento (padrão: o do gráfico atual). */
  async function addTab(symbol = pane.symbol) {
    if (tabs.length >= LIMITS.tabs) return toast.error(`Limite de ${LIMITS.tabs} abas: feche uma para abrir outra`);
    const name = `Gráfico ${tabs.length + 1}`;
    const r = await safeAction(() => createChartTabAction(name));
    if (!r.ok) return toast.error(r.error);
    const id = (r as { ok: true; id: number }).id;
    const base = newPane(symbol);
    // Séries de mercado são diárias: abrem em 1D (os tempos intradiários não existem para elas).
    const first = isMarketId(symbol) ? { ...base, interval: "1d" as ChartInterval } : base;
    const state: TabState = { layout: 1, panes: [first] };
    setTabs((list) => [...list, { id, name, state }]);
    scheduleSave(id, state);
    selectTab(id);
  }

  // "Abrir em Gráficos" (aba Cripto): abre uma vez numa aba nova (as abas e desenhos existentes não mudam)
  // e tira o parâmetro do endereço, para recarregar a página não abrir outra aba.
  const opened = useRef(false);
  useEffect(() => {
    if (!openSymbol || opened.current) return;
    const existing = tabs.find((t) => t.state.layout === 1 && t.state.panes[0]?.symbol === openSymbol);
    // Fora do efeito (depois da montagem): já existe uma aba só com esse instrumento? Vai para ela; senão, cria.
    // A trava fica no disparo (no modo estrito do React o efeito roda duas vezes e o 1º disparo é cancelado).
    const timer = setTimeout(() => {
      if (opened.current) return;
      opened.current = true;
      window.history.replaceState(null, "", "/graficos");
      if (existing) selectTab(existing.id);
      else void addTab(openSymbol);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSymbol]);

  async function renameTab(t: ChartTab) {
    const typed = window.prompt("Nome da aba (apague para voltar a mostrar o par do gráfico):", tabTitle(t).label)?.trim();
    if (typed === undefined) return; // cancelou
    const generic = /^Gráfico \d+$/.test(t.name);
    // Deixou o par que já aparecia: nada muda (o nome continua automático e acompanha o gráfico).
    if (generic && typed === tabTitle(t).label) return;
    // Apagou o nome: volta ao automático (nome genérico guardado, a tela mostra o par).
    const name = typed || `Gráfico ${tabs.findIndex((x) => x.id === t.id) + 1}`;
    if (name === t.name) return;
    const r = await safeAction(() => renameChartTabAction(t.id, name));
    if (!r.ok) return toast.error(r.error);
    setTabs((list) => list.map((x) => (x.id === t.id ? { ...x, name: name.slice(0, LIMITS.tabName) } : x)));
  }

  async function closeTab(t: ChartTab) {
    if (tabs.length <= 1) return toast.error("Mantenha pelo menos uma aba");
    const r = await safeAction(() => deleteChartTabAction(t.id));
    if (!r.ok) return toast.error(r.error);
    const rest = tabs.filter((x) => x.id !== t.id);
    setTabs(rest);
    if (t.id === activeId) selectTab(rest[0].id);
  }

  function setLayout(layout: ChartLayout) {
    const panes = [...tab.state.panes];
    while (panes.length < layout) panes.push(newPane(pane.symbol));
    updateTab({ layout, panes: panes.slice(0, layout) });
    if (activePane >= layout) setActivePane(0);
    setSelected(null);
  }

  const draw = (tool: string) => {
    setSelected(null);
    handles.current[paneIndex]?.draw(tool);
    setDrawing({ pane: paneIndex, tool });
  };
  const forAll = (fn: (h: PaneHandle) => void) => handles.current.forEach((h) => h && fn(h));
  const toggleFavorite = (t: string) =>
    changePrefs({
      ...tools,
      favorites: tools.favorites.includes(t) ? tools.favorites.filter((x) => x !== t) : [...tools.favorites, t],
      visible: [...new Set([...tools.visible, t])],
    });

  // Ícones ao lado do nome de um indicador.
  function indicatorAction(paneI: number, a: IndicatorAction) {
    const p = tab.state.panes[paneI];
    const index = p.indicators.findIndex((i) => i.id === a.id);
    if (index < 0) return; // comparações não têm esses ícones
    const ind = p.indicators[index];
    if (a.action === "hide" || a.action === "show") {
      updatePane({ indicators: p.indicators.map((x, j) => (j === index ? { ...x, visible: x.visible === false } : x)) }, paneI);
    } else if (a.action === "settings") {
      setIndSettings({ pane: paneI, index, figures: handles.current[paneI]?.getFigures(a.id) ?? [] });
    } else if (a.action === "remove") {
      // Remove na hora (sem confirmação): só esta instância; os outros indicadores ficam como estão.
      void ind;
      updatePane({ indicators: p.indicators.filter((_, j) => j !== index) }, paneI);
    } else if (a.action === "volUp" || a.action === "volDown") {
      // Só o Volume: vai para o gráfico de preço (faixa inferior, escala própria) ou volta ao painel próprio,
      // com os mesmos parâmetros e estilos (a mesma instância, sem duplicar).
      updatePane({ indicators: p.indicators.map((x, j) => (j === index ? { ...x, pane: a.action === "volUp" ? "main" : "sub", paneKey: undefined } : x)) }, paneI);
    } else if (a.action === "favorite" || a.action === "unfavorite") {
      // Favorito pelo tipo do indicador (mesma lista da janela de Indicadores); não muda o gráfico.
      toggleFavoriteIndicator(ind.name);
    } else if (a.action === "more") {
      setIndMenu({ pane: paneI, index, x: a.x, y: a.y });
    }
  }
  // Ícones da legenda de uma comparação: ocultar/mostrar, configurar, remover (sem confirmação), mover de painel.
  function compareAction(paneI: number, a: CompareAction) {
    const p = tab.state.panes[paneI];
    const cmp = p.compares[a.index];
    if (!cmp) return;
    const patch = (x: Partial<CompareState>) => updatePane({ compares: p.compares.map((c, j) => (j === a.index ? ({ ...c, ...x } as CompareState) : c)) }, paneI);
    if (a.action === "hide" || a.action === "show") patch({ visible: cmp.visible === false });
    else if (a.action === "settings") setCmpSettings({ pane: paneI, index: a.index });
    else if (a.action === "remove") updatePane({ compares: p.compares.filter((_, j) => j !== a.index) }, paneI);
    else if (a.action === "down") patch({ display: "sub" });
    else if (a.action === "up") patch({ display: "main" });
  }
  const toggleFavoriteIndicator = (name: string) =>
    changePrefs({
      ...tools,
      favoriteIndicators: tools.favoriteIndicators.includes(name) ? tools.favoriteIndicators.filter((x) => x !== name) : [...tools.favoriteIndicators, name],
    });

  const activeTool = drawing && drawing.pane === paneIndex ? drawing.tool : null;
  const iconBtn = "grid size-8 place-items-center rounded text-muted-foreground hover:bg-muted";

  return (
    <div ref={root} className="flex flex-col gap-2">
      {/* Abas de trabalho */}
      <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Abas de gráficos">
        {tabs.map((t) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === tab.id}
            className={cn(
              "group flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm",
              t.id === tab.id ? "border-[#8b7cf6] bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {/* Nome = par do gráfico da aba (muda na hora ao trocar o par); nome dado pela pessoa continua valendo. */}
            <button
              type="button"
              onClick={() => selectTab(t.id)}
              onDoubleClick={() => renameTab(t)}
              title={`${tabTitle(t).full} — clique duas vezes para renomear`}
              className="max-w-40 truncate"
            >
              {tabTitle(t).label}
            </button>
            <button type="button" aria-label={`Fechar ${tabTitle(t).label}`} onClick={() => closeTab(t)} className="opacity-50 hover:opacity-100">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {tabs.length < LIMITS.tabs && (
          <Button size="sm" variant="ghost" onClick={() => void addTab()} aria-label="Nova aba">
            <Plus /> Aba
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {tabs.length}/{LIMITS.tabs} abas
        </span>
      </div>

      {/* Barra superior (gráfico selecionado) */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-2 py-1.5">
        <Button size="sm" variant="outline" onClick={() => setDialog("symbol")} aria-label="Escolher par">
          <Search /> {instrumentLabel(pane.symbol, (s) => s)}
        </Button>
        <IntervalBar
          value={pane.interval}
          shown={tools.intervals}
          onChange={(interval) => updatePane({ interval })}
          onShownChange={(intervals) => changePrefs({ ...tools, intervals })}
        />
        <Seg label="Tipo de gráfico" value={pane.chartType} options={["candle", "ohlc", "area", "line"] as const} onChange={(chartType) => updatePane({ chartType })} render={(v) => TYPE_LABEL[v]} />
        <Seg label="Escala" value={pane.scale} options={["normal", "logarithm", "percentage"] as const} onChange={(scale) => updatePane({ scale })} render={(v) => SCALE_LABEL[v]} />
        <Button size="sm" variant="outline" onClick={() => setDialog("indicators")}>
          Indicadores ({pane.indicators.length})
        </Button>
        <Button size="sm" variant="outline" onClick={() => setDialog("compare")}>
          Comparar ({pane.compares.length})
        </Button>
        <FavoritesBar prefs={tools} activeTool={activeTool} onDraw={draw} />
        <div className="ml-auto flex items-center gap-1.5">
          {/* Mapa de liquidações e perfil lateral de liquidez (independentes; valem para o gráfico selecionado). */}
          <LayerToggle
            on={!!pane.liqMap}
            onToggle={() => updatePane({ liqMap: !pane.liqMap })}
            labelOn="Ocultar mapa de liquidações"
            labelOff="Mostrar mapa de liquidações"
          >
            <Flame />
          </LayerToggle>
          <LayerToggle
            on={!!pane.sideProfile}
            onToggle={() => updatePane({ sideProfile: !pane.sideProfile })}
            labelOn="Ocultar perfil lateral"
            labelOff="Mostrar perfil lateral"
          >
            <AlignRight />
          </LayerToggle>
          {/* Botão A/N do gráfico selecionado: A = ajuste automático da escala de preço; N = enquadramento manual. */}
          <button
            type="button"
            onClick={() => updatePane({ autoScale: !pane.autoScale })}
            aria-pressed={!!pane.autoScale}
            aria-label={pane.autoScale ? "Ajuste automático ativado" : "Ajuste automático desativado"}
            title={pane.autoScale ? "Ajuste automático ativado" : "Ajuste automático desativado"}
            className={cn(
              "grid size-7 cursor-pointer place-items-center rounded-md border text-xs font-semibold transition-colors",
              pane.autoScale ? "border-white bg-white text-zinc-900 hover:bg-zinc-200" : "border-border bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white",
            )}
          >
            {pane.autoScale ? "A" : "N"}
          </button>
          <LayoutGrid className="size-4 text-muted-foreground" />
          <Seg label="Layout" value={tab.state.layout} options={CHART_LAYOUTS} onChange={setLayout} render={(v) => String(v)} />
        </div>
      </div>

      {error && <p className="text-xs text-amber-400">{error}</p>}

      <div className="flex gap-2">
        {/* Barra lateral de ferramentas */}
        <div className="flex w-10 shrink-0 flex-col items-center gap-1 rounded-lg border bg-card py-1.5" aria-label="Ferramentas de desenho">
          <ToolGroups prefs={tools} activeTool={activeTool} onDraw={draw} onToggleFavorite={toggleFavorite} />
          <div className="my-1 w-6 border-t" />
          <button
            type="button"
            title="Ímã (prende nos preços das velas)"
            aria-label="Ímã"
            aria-pressed={magnet}
            onClick={() => {
              setMagnet(!magnet);
              forAll((h) => h.setMagnet(!magnet));
            }}
            className={cn(iconBtn, magnet && "bg-muted text-foreground")}
          >
            <Magnet className="size-4" />
          </button>
          <button
            type="button"
            title={hideDrawings ? "Mostrar desenhos" : "Ocultar desenhos"}
            aria-label={hideDrawings ? "Mostrar desenhos" : "Ocultar desenhos"}
            onClick={() => {
              setHideDrawings(!hideDrawings);
              forAll((h) => h.setHidden("drawings", !hideDrawings));
            }}
            className={iconBtn}
          >
            {hideDrawings ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
          <button
            type="button"
            title={hideIndicators ? "Mostrar indicadores" : "Ocultar indicadores"}
            aria-label={hideIndicators ? "Mostrar indicadores" : "Ocultar indicadores"}
            onClick={() => {
              setHideIndicators(!hideIndicators);
              forAll((h) => h.setHidden("indicators", !hideIndicators));
            }}
            className={cn(iconBtn, "text-[10px] font-semibold", hideIndicators && "line-through")}
          >
            IND
          </button>
          <button
            type="button"
            title={pane.showOhlc === false ? "Mostrar a linha de valores da vela (Time, Open, High, Low, Close, Volume)" : "Ocultar a linha de valores da vela (Time, Open, High, Low, Close, Volume)"}
            aria-label={pane.showOhlc === false ? "Mostrar valores OHLCV" : "Ocultar valores OHLCV"}
            aria-pressed={pane.showOhlc !== false}
            onClick={() => updatePane({ showOhlc: pane.showOhlc === false })}
            className={cn(iconBtn, "text-[9px] font-semibold", pane.showOhlc === false && "line-through")}
          >
            OHLC
          </button>
          <button type="button" title="Lista de desenhos (mostrar ocultos)" aria-label="Lista de desenhos" onClick={() => setDialog("objects")} className={iconBtn}>
            <ListTree className="size-4" />
          </button>
          <button
            type="button"
            title="Apagar os desenhos do gráfico selecionado"
            aria-label="Apagar desenhos"
            onClick={() => {
              if (!window.confirm("Apagar todos os desenhos deste gráfico?")) return;
              handles.current[paneIndex]?.clearDrawings();
              setSelected(null);
            }}
            className={cn(iconBtn, "hover:text-destructive")}
          >
            <Trash2 className="size-4" />
          </button>
          <button type="button" title="Personalizar ferramentas" aria-label="Personalizar ferramentas" onClick={() => setDialog("tools")} className={iconBtn}>
            <Settings2 className="size-4" />
          </button>
        </div>

        {/* Gráficos */}
        <div className={cn("grid h-[calc(100vh-15rem)] min-h-[420px] flex-1 gap-2", GRID[tab.state.layout])}>
          {tab.state.panes.map((p, i) => (
            <ChartPane
              key={`${tab.id}-${i}`}
              pane={p}
              active={i === paneIndex}
              onActivate={() => setActivePane(i)}
              onOverlays={(overlays: OverlayState[]) => updatePaneOf(tab.id, i, { overlays })}
              onError={(message) => setErrors((all) => (all[i] === message ? all : { ...all, [i]: message }))}
              onSelect={(id) => setSelected(id ? { pane: i, id } : null)}
              onObjectSettings={(id) => setSettingsFor({ pane: i, id })}
              onIndicatorAction={(a) => indicatorAction(i, a)}
              onCompareAction={(a) => compareAction(i, a)}
              onLegendCollapse={(legendCollapsed) => updatePaneOf(tab.id, i, { legendCollapsed })}
              favoriteIndicators={tools.favoriteIndicators}
              onAutoScaleChange={(autoScale) => updatePaneOf(tab.id, i, { autoScale })}
              onDrawingChange={(on) => setDrawing((d) => (on ? d : d?.pane === i ? null : d))}
              onViewChange={(v) => updatePaneOf(tab.id, i, (cur) => ({ views: withView(cur.views, v) }))}
              handleRef={(h) => (handles.current[i] = h)}
            >
              {selected?.pane === i && selectedObject && <ObjectToolbar object={selectedObject} actions={objectOps(selected)} />}
              {/* Aviso flutuante (não empurra o gráfico enquanto se marcam os pontos). */}
              {drawing?.pane === i && (
                <p role="status" className="pointer-events-none absolute bottom-9 left-1/2 z-20 -translate-x-1/2 rounded-md bg-popover/90 px-2.5 py-1 text-xs text-muted-foreground shadow">
                  Desenhando: {TOOL_LABEL[drawing.tool]}. Clique para marcar os pontos — Esc cancela.
                </p>
              )}
            </ChartPane>
          ))}
        </div>
      </div>

      {/* Rodapé: atalhos de período */}
      <div className="flex flex-wrap items-center gap-1 pl-12 text-xs" role="group" aria-label="Período">
        {RANGES.map((r) => (
          <button key={r.label} type="button" onClick={() => updatePane({ interval: r.interval })} className="rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            {r.label}
          </button>
        ))}
      </div>

      <SymbolDialog open={dialog === "symbol"} onClose={() => setDialog(null)} symbols={symbols} onPick={(symbol) => (updatePane({ symbol }), setDialog(null))} />
      <IndicatorsDialog
        open={dialog === "indicators"}
        onClose={() => setDialog(null)}
        pane={pane}
        favorites={tools.favoriteIndicators}
        onFavorite={toggleFavoriteIndicator}
        onChange={(indicators) => updatePane({ indicators })}
        isTemplate={tools.template?.sourceTabId === tab.id && (tools.template?.sourcePane ?? 0) === paneIndex}
        onUseAsTemplate={useAsTemplate}
      />
      <CompareDialog
        open={dialog === "compare"}
        onClose={() => setDialog(null)}
        pane={pane}
        symbols={symbols}
        portfolio={portfolio}
        onChange={(compares) => updatePane({ compares })}
        onSettings={(index) => {
          setDialog(null);
          setCmpSettings({ pane: paneIndex, index });
        }}
      />
      <ToolsDialog open={dialog === "tools"} onClose={() => setDialog(null)} prefs={tools} onChange={changePrefs} />
      <ObjectsDialog
        open={dialog === "objects"}
        onClose={() => setDialog(null)}
        objects={pane.overlays}
        onToggle={(o, patch) => o.id && handles.current[paneIndex]?.updateOverlay(o.id, patch)}
        onRemove={(o) => o.id && handles.current[paneIndex]?.removeOverlay(o.id)}
        onSelect={(o) => {
          if (!o.id) return;
          setDialog(null);
          setSettingsFor({ pane: paneIndex, id: o.id });
        }}
      />
      <ObjectSettingsDialog
        open={!!settingsFor}
        object={settingsObject}
        onClose={() => setSettingsFor(null)}
        onApply={(patch) => settingsFor && handles.current[settingsFor.pane]?.updateOverlay(settingsFor.id, patch)}
      />
      <IndicatorMenu
        target={indMenu}
        indicators={indMenu ? tab.state.panes[indMenu.pane].indicators : []}
        favorites={tools.favoriteIndicators}
        onClose={() => setIndMenu(null)}
        onFavorite={toggleFavoriteIndicator}
        onSettings={(index) => {
          if (!indMenu) return;
          const id = tab.state.panes[indMenu.pane].indicators[index]?.id ?? "";
          setIndSettings({ pane: indMenu.pane, index, figures: handles.current[indMenu.pane]?.getFigures(id) ?? [] });
          setIndMenu(null);
        }}
        onChange={(indicators) => indMenu && updatePane({ indicators }, indMenu.pane)}
      />
      <CompareSettingsDialog
        compare={cmpSettings ? (tab.state.panes[cmpSettings.pane]?.compares[cmpSettings.index] ?? null) : null}
        index={cmpSettings?.index ?? 0}
        symbol={cmpSettings ? (tab.state.panes[cmpSettings.pane]?.symbol ?? "") : ""}
        onClose={() => setCmpSettings(null)}
        onApply={(next) =>
          cmpSettings &&
          updatePane({ compares: tab.state.panes[cmpSettings.pane].compares.map((c, j) => (j === cmpSettings.index ? next : c)) }, cmpSettings.pane)
        }
      />
      <IndicatorSettingsDialog
        open={!!indSettings}
        indicator={indSettings ? (tab.state.panes[indSettings.pane]?.indicators[indSettings.index] ?? null) : null}
        figures={indSettings?.figures ?? []}
        onClose={() => setIndSettings(null)}
        onApply={(next) =>
          indSettings && updatePane({ indicators: tab.state.panes[indSettings.pane].indicators.map((x, j) => (j === indSettings.index ? next : x)) }, indSettings.pane)
        }
      />
    </div>
  );
}

/** Instrumentos de mercado (capitalização, dominância) e o par invertido BTC/ETH, para o seletor e a busca. */
const MARKET_OPTIONS: { symbol: string; label: string; name: string; keywords: string }[] = [
  ...MARKET_SERIES.map((m) => ({ symbol: m.id, label: m.short, name: m.name, keywords: m.keywords })),
  ...Object.entries(INVERTED_PAIRS).map(([s, p]) => ({ symbol: s, label: p.label, name: p.name, keywords: p.keywords })),
];
const QUOTE_TABS = [...CHART_QUOTES, "Mercado"] as const;

/** Botão de camada do gráfico (liga/desliga), com a etiqueta embaixo ao passar o mouse (como na referência). */
function LayerToggle({ on, onToggle, labelOn, labelOff, children }: { on: boolean; onToggle: () => void; labelOn: string; labelOff: string; children: React.ReactNode }) {
  const label = on ? labelOn : labelOff;
  return (
    <span className="group relative">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        aria-label={label}
        className={cn(
          "grid size-7 cursor-pointer place-items-center rounded-md border transition-colors [&_svg]:size-3.5",
          on ? "border-[#8b7cf6] bg-[#8b7cf6]/20 text-white hover:bg-[#8b7cf6]/30" : "border-border bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200",
        )}
      >
        {children}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute top-full left-1/2 z-40 mt-1.5 hidden -translate-x-1/2 rounded-md border border-border bg-zinc-800/95 px-2 py-1 text-xs whitespace-nowrap text-zinc-100 shadow-lg group-focus-within:block group-hover:block"
      >
        {label}
      </span>
    </span>
  );
}

function SymbolDialog({ open, onClose, symbols, onPick }: { open: boolean; onClose: () => void; symbols: SymbolOption[]; onPick: (s: string) => void }) {
  const [q, setQ] = useState("");
  const [quote, setQuote] = useState<string>("USDT");
  const list = useMemo(() => {
    const s = q.trim().toUpperCase();
    if (quote === "Mercado") return [];
    return symbols.filter((x) => x.quote === quote && (!s || x.symbol.includes(s) || x.base.startsWith(s))).slice(0, 80);
  }, [q, quote, symbols]);
  const market = useMemo(() => {
    const s = q.trim().toLowerCase();
    return quote !== "Mercado" ? [] : MARKET_OPTIONS.filter((m) => !s || [m.symbol, m.label, m.name, m.keywords].join(" ").toLowerCase().includes(s));
  }, [q, quote]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Escolher par</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input autoFocus aria-label="Buscar par" placeholder="Buscar (ex.: SOL)" value={q} onChange={(e) => setQ(e.target.value)} />
          <Seg label="Cotação" value={quote} options={QUOTE_TABS} onChange={setQuote} render={(v) => v} />
        </div>
        {quote === "Mercado" && (
          <ul className="grid max-h-80 gap-1 overflow-auto sm:grid-cols-2" aria-label="Instrumentos de mercado">
            {market.map((m) => (
              <li key={m.symbol}>
                <button type="button" onClick={() => onPick(m.symbol)} className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
                  <span className="font-medium">{m.label}</span> <span className="text-xs text-muted-foreground">{m.name}</span>
                </button>
              </li>
            ))}
            {!market.length && <li className="col-span-full py-6 text-center text-sm text-muted-foreground">Nenhum instrumento encontrado.</li>}
          </ul>
        )}
        <ul className={cn("grid max-h-80 grid-cols-2 gap-1 overflow-auto sm:grid-cols-3", quote === "Mercado" && "hidden")}>
          {list.map((s) => (
            <li key={s.symbol}>
              <button type="button" onClick={() => onPick(s.symbol)} className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
                <span className="font-medium">{s.base}</span>
                <span className="text-muted-foreground">/{s.quote}</span>
              </button>
            </li>
          ))}
          {!list.length && <li className="col-span-full py-6 text-center text-sm text-muted-foreground">Nenhum par encontrado.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function IndicatorsDialog({
  open,
  onClose,
  pane,
  favorites,
  onFavorite,
  onChange,
  isTemplate,
  onUseAsTemplate,
}: {
  open: boolean;
  onClose: () => void;
  pane: PaneState;
  favorites: string[];
  onFavorite: (name: string) => void;
  onChange: (i: IndicatorState[]) => void;
  /** Este gráfico é a referência do modelo dos gráficos novos. */
  isTemplate: boolean;
  onUseAsTemplate: () => void;
}) {
  const [q, setQ] = useState("");
  // Favoritos primeiro.
  const list = CHART_INDICATORS.filter((i) => !q.trim() || i.label.toLowerCase().includes(q.trim().toLowerCase())).sort(
    (a, b) => Number(favorites.includes(b.name)) - Number(favorites.includes(a.name)),
  );
  const full = pane.indicators.length >= LIMITS.indicatorsPerPane;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Indicadores</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Input aria-label="Buscar indicador" placeholder="Buscar indicador" value={q} onChange={(e) => setQ(e.target.value)} />
            <ul className="max-h-80 overflow-auto">
              {list.map((i) => {
                const fav = favorites.includes(i.name);
                return (
                  <li key={i.name} className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={fav ? `Tirar ${i.label} dos favoritos` : `Favoritar ${i.label}`}
                      aria-pressed={fav}
                      onClick={() => onFavorite(i.name)}
                      className="grid size-7 place-items-center rounded hover:bg-muted"
                    >
                      <Star className={cn("size-3.5", fav ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
                    </button>
                    <button
                      type="button"
                      disabled={full}
                      onClick={() => onChange([...pane.indicators, { id: newIndicatorId(), name: i.name, params: i.params, pane: i.pane }])}
                      className="flex min-w-0 flex-1 items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
                    >
                      {i.label}
                      <span className="text-xs text-muted-foreground">{i.pane === "main" ? "no preço" : "painel"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              No gráfico ({pane.indicators.length}/{LIMITS.indicatorsPerPane})
            </p>
            <ul className="flex max-h-80 flex-col gap-1.5 overflow-auto" aria-label="Indicadores no gráfico">
              {pane.indicators.map((ind, idx) => (
                <li key={`${ind.id ?? idx}-${ind.params.join(",")}`} className="flex items-center gap-2 text-sm">
                  <span className={cn("min-w-0 flex-1 truncate", ind.visible === false && "text-muted-foreground line-through")}>{indicatorLabel(ind.name)}</span>
                  {/* Ajuste rápido dos períodos: é o mesmo dado da janela de configurações. */}
                  <Input
                    aria-label={`Parâmetros de ${ind.name}`}
                    className="h-7 w-28 text-xs"
                    defaultValue={ind.params.join(", ")}
                    onBlur={(e) => {
                      const params = e.target.value
                        .split(",")
                        .map((s) => Number(s.trim()))
                        .filter((n) => Number.isFinite(n) && n > 0 && n <= 10_000)
                        .slice(0, LIMITS.paramsPerIndicator);
                      if (params.join(",") === ind.params.join(",")) return;
                      onChange(pane.indicators.map((x, j) => (j === idx ? { ...x, params } : x)));
                    }}
                  />
                  <Button size="icon-sm" variant="ghost" aria-label={`Remover ${ind.name}`} onClick={() => onChange(pane.indicators.filter((_, j) => j !== idx))}>
                    <X />
                  </Button>
                </li>
              ))}
              {!pane.indicators.length && <li className="text-sm text-muted-foreground">Nenhum indicador.</li>}
            </ul>
            {/* Modelo: gráficos novos (nova aba ou mais divisões) abrem com estes indicadores e estilos. */}
            <div className="mt-auto flex flex-col gap-1 border-t pt-2 text-xs text-muted-foreground">
              {isTemplate ? (
                <p>Este gráfico é o modelo: os gráficos novos abrem com esta configuração (cada um calculado com o próprio ativo).</p>
              ) : (
                <>
                  <p>Gráficos novos abrem com a configuração do gráfico modelo.</p>
                  <Button size="sm" variant="outline" className="self-start" onClick={onUseAsTemplate}>
                    Usar este gráfico como modelo
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToolsDialog({ open, onClose, prefs, onChange }: { open: boolean; onClose: () => void; prefs: ToolPrefs; onChange: (p: ToolPrefs) => void }) {
  const toggle = (list: string[], t: string) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);
  const move = (t: string, dir: -1 | 1) => {
    const list = [...prefs.favorites];
    const i = list.indexOf(t);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    onChange({ ...prefs, favorites: list });
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Personalizar ferramentas</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Escolha quais aparecem nos menus da barra lateral e quais são favoritas (barra de acesso rápido, na ordem abaixo).</p>
        {prefs.favorites.length > 0 && (
          <ol className="flex flex-col gap-1 rounded-md border p-2" aria-label="Ordem das favoritas">
            {prefs.favorites.map((t, i) => (
              <li key={t} className="flex items-center gap-2 text-sm">
                <Star className="size-3.5 fill-amber-400 text-amber-400" />
                <span className="flex-1">{TOOL_LABEL[t] ?? t}</span>
                <Button size="icon-sm" variant="ghost" aria-label={`Subir ${TOOL_LABEL[t] ?? t}`} disabled={i === 0} onClick={() => move(t, -1)}>
                  <ArrowUp />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Descer ${TOOL_LABEL[t] ?? t}`} disabled={i === prefs.favorites.length - 1} onClick={() => move(t, 1)}>
                  <ArrowDown />
                </Button>
              </li>
            ))}
          </ol>
        )}
        <ul className="flex max-h-80 flex-col gap-1 overflow-auto">
          {CHART_TOOLS.map((t) => {
            const visible = prefs.visible.includes(t.name);
            const fav = prefs.favorites.includes(t.name);
            return (
              <li key={t.name} className="flex items-center gap-3 rounded px-2 py-1 text-sm hover:bg-muted/50">
                <input
                  type="checkbox"
                  aria-label={`Mostrar ${t.label}`}
                  checked={visible}
                  onChange={() => onChange({ ...prefs, visible: toggle(prefs.visible, t.name), favorites: visible ? prefs.favorites.filter((x) => x !== t.name) : prefs.favorites })}
                />
                <span className="flex-1">{t.label}</span>
                <button
                  type="button"
                  aria-label={fav ? `Tirar ${t.label} dos favoritos` : `Favoritar ${t.label}`}
                  aria-pressed={fav}
                  onClick={() => onChange({ ...prefs, visible: fav ? prefs.visible : [...new Set([...prefs.visible, t.name])], favorites: toggle(prefs.favorites, t.name) })}
                >
                  <Star className={cn("size-4", fav ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

type Entry = { c: CompareState; label: string; hint?: string; keywords?: string };

function CompareDialog({
  open,
  onClose,
  pane,
  symbols,
  portfolio,
  onChange,
  onSettings,
}: {
  open: boolean;
  onClose: () => void;
  pane: PaneState;
  symbols: SymbolOption[];
  portfolio: string[];
  onChange: (c: CompareState[]) => void;
  onSettings?: (index: number) => void;
}) {
  const [q, setQ] = useState("");
  const full = pane.compares.length >= LIMITS.comparesPerPane;
  const has = (c: CompareState) => pane.compares.some((x) => x.kind === c.kind && x.id === c.id);
  const add = (c: CompareState) => !full && !has(c) && onChange([...pane.compares, c]);
  const labelOf = compareLabel;
  // Onde aparece: escolha da pessoa, ou o padrão (juros do FRED em painel; o resto, inclusive on-chain, sobre o preço).
  const displayOf = compareDisplay;
  const patch = (i: number, p: Partial<CompareState>) => onChange(pane.compares.map((x, j) => (j === i ? ({ ...x, ...p } as CompareState) : x)));
  const listed = useMemo(() => new Set(symbols.map((x) => x.symbol)), [symbols]);
  // Lista inicial enxuta (os principais); todo o resto fica na busca "Procurar instrumento".
  const main: Entry[] = [
    ...(listed.has("PAXGUSDT") ? [{ c: { kind: "pair", id: "PAXGUSDT" } as CompareState, label: "Ouro (PAXG/USDT)", hint: "Binance" }] : []),
    { c: { kind: "market", id: "BTC.D" }, label: "BTC.D — Dominância do Bitcoin", hint: "Mercado" },
    { c: { kind: "market", id: "USDT.D" }, label: "USDT.D — Dominância do USDT", hint: "Mercado" },
    { c: { kind: "market", id: "TOTAL3" }, label: "TOTAL3 — Market cap sem BTC e ETH", hint: "Mercado" },
    ...(listed.has("ETHBTC") ? [{ c: { kind: "pair", id: "ETHBTC" } as CompareState, label: "ETH/BTC", hint: "Binance" }] : []),
  ];
  // Catálogo da busca: mercado, on-chain, macro, ativos do Portfólio e qualquer par da Binance.
  const catalog = useMemo<Entry[]>(
    () => [
      ...MARKET_OPTIONS.map((m): Entry => ({ c: isMarketId(m.symbol) ? { kind: "market", id: m.symbol } : { kind: "pair", id: m.symbol }, label: `${m.label} — ${m.name}`, hint: "Mercado", keywords: m.keywords })),
      ...ONCHAIN_SERIES.map((o): Entry => ({ c: { kind: "onchain", id: o.id }, label: `${o.short} — ${o.name}`, hint: "On-chain", keywords: `${o.description} ${o.purpose}` })),
      ...MACRO_SERIES.map((m): Entry => ({ c: { kind: "macro", id: m.id }, label: m.label, hint: "Macro (FRED)", keywords: m.id })),
      ...portfolio.map((p): Entry => ({ c: { kind: "pair", id: p }, label: `${pairLabel(p)} — no seu Portfólio`, hint: "Portfólio" })),
      ...symbols.map((x): Entry => ({ c: { kind: "pair", id: x.symbol }, label: `${x.base}/${x.quote}`, hint: "Binance" })),
    ],
    [symbols, portfolio],
  );
  const results = useMemo(() => {
    const raw = q.trim().toLowerCase();
    if (!raw) return [];
    const compact = raw.replace(/[s/.]/g, "");
    const seen = new Set<string>();
    return catalog
      .filter((e) => {
        const sym = e.c.id.toLowerCase().replace(/[s/.]/g, "");
        const ok = sym.includes(compact) || e.label.toLowerCase().includes(raw) || (e.keywords ?? "").toLowerCase().includes(raw);
        const key = e.c.kind + e.c.id;
        if (!ok || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 40);
  }, [q, catalog]);
  const item = (e: Entry) => (
    <button
      key={e.c.kind + e.c.id}
      type="button"
      disabled={full || has(e.c)}
      onClick={() => add(e.c)}
      className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
    >
      <span className="min-w-0 truncate">{e.label}</span>
      {e.hint && <span className="shrink-0 text-xs text-muted-foreground">{e.hint}</span>}
    </button>
  );
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Comparar na mesma janela</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Sobre o preço, a comparação começa no mesmo ponto (desempenho relativo) ou usa escala própria (unidades diferentes, como dominâncias em %), sem distorcer os valores. Em
          painel separado, aparece com os valores reais. Todas compartilham o eixo do tempo do gráfico.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Principais</p>
            {main.map(item)}
            <p className="mt-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Procurar instrumento (personalizado)</p>
            <Input aria-label="Procurar instrumento" placeholder="Símbolo ou nome (ex.: TOTAL3, dominância do USDT, ETH/BTC, SOPR, juros)" value={q} onChange={(e) => setQ(e.target.value)} />
            <ul className="max-h-72 overflow-auto" aria-label="Resultados da busca">
              {results.map((e) => (
                <li key={e.c.kind + e.c.id}>{item(e)}</li>
              ))}
              {q.trim() && !results.length && <li className="px-2 py-2 text-xs text-muted-foreground">Nenhum instrumento encontrado.</li>}
              {!q.trim() && <li className="px-2 py-2 text-xs text-muted-foreground">Busca em: mercado (TOTAL, dominâncias), on-chain, macro (FRED), ativos do Portfólio e pares da Binance.</li>}
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              No gráfico ({pane.compares.length}/{LIMITS.comparesPerPane})
            </p>
            <ul className="flex flex-col gap-1" aria-label="Comparações no gráfico">
              {pane.compares.map((c, i) => (
                <li key={c.kind + c.id} className="flex items-center gap-1 text-sm">
                  <span className={cn("min-w-0 flex-1 truncate", c.visible === false && "text-muted-foreground line-through")}>{labelOf(c)}</span>
                  <ColorPicker label={`Cor de ${labelOf(c)}`} value={c.color ?? COMPARE_COLORS[i % COMPARE_COLORS.length]} onChange={(color) => patch(i, { color })} />
                  <WidthMenu value={c.size ?? 1.5} onChange={(size) => patch(i, { size })} />
                  <Button size="icon-sm" variant="ghost" aria-label={c.visible === false ? `Mostrar ${labelOf(c)}` : `Ocultar ${labelOf(c)}`} onClick={() => patch(i, { visible: c.visible === false })}>
                    {c.visible === false ? <EyeOff /> : <Eye />}
                  </Button>
                  <select
                    aria-label={`Onde mostrar ${labelOf(c)}`}
                    value={displayOf(c)}
                    onChange={(e) => patch(i, { display: e.target.value as "main" | "sub" })}
                    className="h-7 rounded-md border bg-background px-1 text-xs"
                  >
                    <option value="main">Sobre o preço</option>
                    <option value="sub">Painel separado</option>
                  </select>
                  {onSettings && (
                    <Button size="icon-sm" variant="ghost" aria-label={`Configurações de ${labelOf(c)}`} onClick={() => onSettings(i)}>
                      <Settings2 />
                    </Button>
                  )}
                  <Button size="icon-sm" variant="ghost" aria-label={`Remover comparação ${labelOf(c)}`} onClick={() => onChange(pane.compares.filter((_, j) => j !== i))}>
                    <X />
                  </Button>
                </li>
              ))}
              {!pane.compares.length && <li className="text-sm text-muted-foreground">Nenhuma comparação.</li>}
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
