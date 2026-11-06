"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignJustify,
  ArrowRight,
  ArrowUp,
  DollarSign,
  Equal,
  Eye,
  EyeOff,
  GripHorizontal,
  GripVertical,
  LayoutGrid,
  Magnet,
  MessageSquare,
  Minus,
  MoveDiagonal,
  MoveUpRight,
  Plus,
  Rows3,
  Ruler,
  Search,
  SeparatorVertical,
  Settings2,
  Slash,
  Square,
  Star,
  Tag,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
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
import { CHART_INTERVALS, CHART_QUOTES, type ChartInterval } from "@/lib/charts/params";
import type { ChartTab } from "@/lib/charts/store";
import {
  CHART_INDICATORS,
  CHART_LAYOUTS,
  CHART_TOOLS,
  LIMITS,
  defaultPane,
  type ChartLayout,
  type ChartScale,
  type ChartType,
  type OverlayState,
  type PaneState,
  type TabState,
  type ToolPrefs,
} from "@/lib/charts/workspace";
import { safeAction } from "@/lib/safe-action";
import { cn } from "@/lib/utils";
import type { PaneHandle } from "./chart-pane";

// O gráfico usa o canvas do navegador: carregado só no cliente.
const ChartPane = dynamic(() => import("./chart-pane").then((m) => m.ChartPane), { ssr: false });

export type SymbolOption = { symbol: string; base: string; quote: string };

const INTERVAL_LABEL: Record<ChartInterval, string> = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "D", "1w": "S", "1M": "M" };
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
const TOOL_ICON: Record<string, LucideIcon> = {
  segment: Slash,
  rayLine: MoveUpRight,
  straightLine: MoveDiagonal,
  horizontalStraightLine: Minus,
  horizontalRayLine: ArrowRight,
  horizontalSegment: GripHorizontal,
  verticalStraightLine: SeparatorVertical,
  verticalRayLine: ArrowUp,
  verticalSegment: GripVertical,
  priceLine: DollarSign,
  parallelStraightLine: Equal,
  priceChannelLine: Rows3,
  fibonacciLine: AlignJustify,
  rectangle: Square,
  measure: Ruler,
  simpleAnnotation: MessageSquare,
  simpleTag: Tag,
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

export function ChartWorkspace({
  initialTabs,
  initialPrefs,
  symbols,
}: {
  initialTabs: ChartTab[];
  initialPrefs: { tools: ToolPrefs; activeTabId: number | null };
  symbols: SymbolOption[];
}) {
  const [tabs, setTabs] = useState(initialTabs);
  const [activeId, setActiveId] = useState(
    initialTabs.some((t) => t.id === initialPrefs.activeTabId) ? (initialPrefs.activeTabId as number) : initialTabs[0].id,
  );
  const [tools, setTools] = useState(initialPrefs.tools);
  const [activePane, setActivePane] = useState(0);
  const [magnet, setMagnet] = useState(false);
  const [hideDrawings, setHideDrawings] = useState(false);
  const [hideIndicators, setHideIndicators] = useState(false);
  const [dialog, setDialog] = useState<null | "symbol" | "indicators" | "tools">(null);
  const [error, setError] = useState<string | null>(null);
  const handles = useRef<(PaneHandle | null)[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const tab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const paneIndex = Math.min(activePane, tab.state.panes.length - 1);
  const pane = tab.state.panes[paneIndex];

  // Salva a aba na conta ~1 s depois da última mudança.
  function updateTab(next: TabState) {
    setTabs((list) => list.map((t) => (t.id === tab.id ? { ...t, state: next } : t)));
    clearTimeout(saveTimer.current);
    const id = tab.id;
    saveTimer.current = setTimeout(async () => {
      const r = await safeAction(() => saveChartTabAction(id, next));
      if (!r.ok) toast.error(r.error);
    }, 1000);
  }
  const updatePane = (patch: Partial<PaneState>, index = paneIndex) =>
    updateTab({ ...tab.state, panes: tab.state.panes.map((p, i) => (i === index ? { ...p, ...patch } : p)) });

  function savePrefs(nextTools: ToolPrefs, nextActive: number) {
    void safeAction(() => saveChartPrefsAction(nextTools, nextActive));
  }
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  function selectTab(id: number) {
    setActiveId(id);
    setActivePane(0);
    savePrefs(tools, id);
  }

  async function addTab() {
    if (tabs.length >= LIMITS.tabs) return toast.error(`Limite de ${LIMITS.tabs} abas`);
    const name = `Gráfico ${tabs.length + 1}`;
    const r = await safeAction(() => createChartTabAction(name));
    if (!r.ok) return toast.error(r.error);
    const id = (r as { ok: true; id: number }).id;
    setTabs((list) => [...list, { id, name, state: { layout: 1, panes: [defaultPane(pane.symbol)] } }]);
    selectTab(id);
  }

  async function renameTab(t: ChartTab) {
    const name = window.prompt("Nome da aba:", t.name)?.trim();
    if (!name || name === t.name) return;
    const r = await safeAction(() => renameChartTabAction(t.id, name));
    if (!r.ok) return toast.error(r.error);
    setTabs((list) => list.map((x) => (x.id === t.id ? { ...x, name: name.slice(0, LIMITS.tabName) } : x)));
  }

  async function closeTab(t: ChartTab) {
    if (tabs.length <= 1) return toast.error("Mantenha pelo menos uma aba");
    if (!window.confirm(`Fechar a aba "${t.name}"? Os gráficos e desenhos dela serão apagados.`)) return;
    const r = await safeAction(() => deleteChartTabAction(t.id));
    if (!r.ok) return toast.error(r.error);
    const rest = tabs.filter((x) => x.id !== t.id);
    setTabs(rest);
    if (t.id === activeId) selectTab(rest[0].id);
  }

  function setLayout(layout: ChartLayout) {
    const panes = [...tab.state.panes];
    while (panes.length < layout) panes.push(defaultPane(pane.symbol));
    updateTab({ layout, panes: panes.slice(0, layout) });
    if (activePane >= layout) setActivePane(0);
  }

  const favorites = tools.favorites.filter((t) => tools.visible.includes(t));
  const others = tools.visible.filter((t) => !tools.favorites.includes(t));
  const draw = (tool: string) => handles.current[paneIndex]?.draw(tool);
  const forAll = (fn: (h: PaneHandle) => void) => handles.current.forEach((h) => h && fn(h));

  return (
    <div className="flex flex-col gap-2">
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
            <button type="button" onClick={() => selectTab(t.id)} onDoubleClick={() => renameTab(t)} title="Clique duas vezes para renomear">
              {t.name}
            </button>
            <button type="button" aria-label={`Fechar ${t.name}`} onClick={() => closeTab(t)} className="opacity-50 hover:opacity-100">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {tabs.length < LIMITS.tabs && (
          <Button size="sm" variant="ghost" onClick={addTab} aria-label="Nova aba">
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
          <Search /> {pane.symbol}
        </Button>
        <Seg label="Tempo do gráfico" value={pane.interval} options={CHART_INTERVALS} onChange={(interval) => updatePane({ interval })} render={(v) => INTERVAL_LABEL[v]} />
        <Seg label="Tipo de gráfico" value={pane.chartType} options={["candle", "ohlc", "area", "line"] as const} onChange={(chartType) => updatePane({ chartType })} render={(v) => TYPE_LABEL[v]} />
        <Seg label="Escala" value={pane.scale} options={["normal", "logarithm", "percentage"] as const} onChange={(scale) => updatePane({ scale })} render={(v) => SCALE_LABEL[v]} />
        <Button size="sm" variant="outline" onClick={() => setDialog("indicators")}>
          Indicadores ({pane.indicators.length})
        </Button>
        <div className="ml-auto flex items-center gap-1.5">
          <LayoutGrid className="size-4 text-muted-foreground" />
          <Seg label="Layout" value={tab.state.layout} options={CHART_LAYOUTS} onChange={setLayout} render={(v) => String(v)} />
        </div>
      </div>

      {error && <p className="text-xs text-amber-400">{error}</p>}

      <div className="flex gap-2">
        {/* Barra lateral de ferramentas */}
        <div className="flex w-10 shrink-0 flex-col items-center gap-1 rounded-lg border bg-card py-1.5" aria-label="Ferramentas de desenho">
          {[...favorites, ...others].map((t, i) => {
            const Icon = TOOL_ICON[t] ?? Slash;
            return (
              <button
                key={t}
                type="button"
                title={TOOL_LABEL[t]}
                aria-label={TOOL_LABEL[t]}
                onClick={() => draw(t)}
                className={cn(
                  "relative grid size-8 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground",
                  i === favorites.length - 1 && favorites.length > 0 && others.length > 0 && "mb-1 after:absolute after:-bottom-1 after:h-px after:w-6 after:bg-border",
                )}
              >
                <Icon className="size-4" />
                {favorites.includes(t) && <Star className="absolute top-0.5 right-0.5 size-2 fill-amber-400 text-amber-400" />}
              </button>
            );
          })}
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
            className={cn("grid size-8 place-items-center rounded text-muted-foreground hover:bg-muted", magnet && "bg-muted text-foreground")}
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
            className="grid size-8 place-items-center rounded text-muted-foreground hover:bg-muted"
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
            className={cn("grid size-8 place-items-center rounded text-[10px] font-semibold text-muted-foreground hover:bg-muted", hideIndicators && "line-through")}
          >
            IND
          </button>
          <button
            type="button"
            title="Apagar os desenhos do gráfico selecionado"
            aria-label="Apagar desenhos"
            onClick={() => window.confirm("Apagar todos os desenhos deste gráfico?") && handles.current[paneIndex]?.clearDrawings()}
            className="grid size-8 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
          <button
            type="button"
            title="Personalizar ferramentas"
            aria-label="Personalizar ferramentas"
            onClick={() => setDialog("tools")}
            className="grid size-8 place-items-center rounded text-muted-foreground hover:bg-muted"
          >
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
              onOverlays={(overlays: OverlayState[]) => updatePane({ overlays }, i)}
              onError={setError}
              handleRef={(h) => (handles.current[i] = h)}
            />
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
      <IndicatorsDialog open={dialog === "indicators"} onClose={() => setDialog(null)} pane={pane} onChange={(indicators) => updatePane({ indicators })} />
      <ToolsDialog
        open={dialog === "tools"}
        onClose={() => setDialog(null)}
        prefs={tools}
        onChange={(next) => {
          setTools(next);
          savePrefs(next, tab.id);
        }}
      />
    </div>
  );
}

function SymbolDialog({ open, onClose, symbols, onPick }: { open: boolean; onClose: () => void; symbols: SymbolOption[]; onPick: (s: string) => void }) {
  const [q, setQ] = useState("");
  const [quote, setQuote] = useState<string>("USDT");
  const list = useMemo(() => {
    const s = q.trim().toUpperCase();
    return symbols.filter((x) => x.quote === quote && (!s || x.symbol.includes(s) || x.base.startsWith(s))).slice(0, 80);
  }, [q, quote, symbols]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Escolher par</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input autoFocus aria-label="Buscar par" placeholder="Buscar (ex.: SOL)" value={q} onChange={(e) => setQ(e.target.value)} />
          <Seg label="Cotação" value={quote} options={CHART_QUOTES} onChange={setQuote} render={(v) => v} />
        </div>
        <ul className="grid max-h-80 grid-cols-2 gap-1 overflow-auto sm:grid-cols-3">
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

function IndicatorsDialog({ open, onClose, pane, onChange }: { open: boolean; onClose: () => void; pane: PaneState; onChange: (i: PaneState["indicators"]) => void }) {
  const [q, setQ] = useState("");
  const list = CHART_INDICATORS.filter((i) => !q.trim() || i.label.toLowerCase().includes(q.trim().toLowerCase()));
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
              {list.map((i) => (
                <li key={i.name}>
                  <button
                    type="button"
                    disabled={full}
                    onClick={() => onChange([...pane.indicators, { name: i.name, params: i.params, pane: i.pane }])}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
                  >
                    {i.label}
                    <span className="text-xs text-muted-foreground">{i.pane === "main" ? "no preço" : "painel"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              No gráfico ({pane.indicators.length}/{LIMITS.indicatorsPerPane})
            </p>
            <ul className="flex max-h-80 flex-col gap-1.5 overflow-auto" aria-label="Indicadores no gráfico">
              {pane.indicators.map((ind, idx) => (
                <li key={idx} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{CHART_INDICATORS.find((c) => c.name === ind.name)?.label ?? ind.name}</span>
                  <Input
                    aria-label={`Parâmetros de ${ind.name}`}
                    className="h-7 w-28 text-xs"
                    defaultValue={ind.params.join(", ")}
                    onBlur={(e) => {
                      const params = e.target.value
                        .split(",")
                        .map((s) => Number(s.trim()))
                        .filter((n) => Number.isFinite(n) && Math.abs(n) <= 10_000)
                        .slice(0, LIMITS.paramsPerIndicator);
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToolsDialog({ open, onClose, prefs, onChange }: { open: boolean; onClose: () => void; prefs: ToolPrefs; onChange: (p: ToolPrefs) => void }) {
  const toggle = (list: string[], t: string) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Personalizar ferramentas</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Escolha quais aparecem na barra lateral e quais são favoritas (ficam no topo).</p>
        <ul className="flex max-h-96 flex-col gap-1 overflow-auto">
          {CHART_TOOLS.map((t) => {
            const visible = prefs.visible.includes(t.name);
            const fav = prefs.favorites.includes(t.name);
            return (
              <li key={t.name} className="flex items-center gap-3 rounded px-2 py-1 text-sm hover:bg-muted/50">
                <input
                  type="checkbox"
                  aria-label={`Mostrar ${t.label}`}
                  checked={visible}
                  onChange={() =>
                    onChange({ visible: toggle(prefs.visible, t.name), favorites: visible ? prefs.favorites.filter((x) => x !== t.name) : prefs.favorites })
                  }
                />
                <span className="flex-1">{t.label}</span>
                <button
                  type="button"
                  aria-label={fav ? `Tirar ${t.label} dos favoritos` : `Favoritar ${t.label}`}
                  aria-pressed={fav}
                  onClick={() => onChange({ visible: fav ? prefs.visible : [...new Set([...prefs.visible, t.name])], favorites: toggle(prefs.favorites, t.name) })}
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
