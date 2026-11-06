"use client";

// Menus e configurações dos indicadores (ícones ao lado do nome no gráfico).
import { useState } from "react";
import { Copy, Eye, EyeOff, Layers, MoveVertical, Settings2, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CHART_INDICATORS, LIMITS, MA_TYPES, type IndicatorState, type MaType, type SeriesStyle } from "@/lib/charts/workspace";
import { cn } from "@/lib/utils";
import { ColorPicker, NumberInput, StyleMenu, WidthMenu } from "./object-ui";

export const indicatorLabel = (name: string) => CHART_INDICATORS.find((c) => c.name === name)?.label ?? name;

/** Nome de cada parâmetro (Entradas). Indicadores sem nomes aqui mostram "Parâmetro n". */
const PARAM_LABELS: Record<string, string[]> = {
  MA: ["MA 1 — período", "MA 2 — período", "MA 3 — período", "MA 4 — período"],
  EMA: ["EMA 1 — período", "EMA 2 — período", "EMA 3 — período"],
  SMA: ["Período", "Peso"],
  MA_RIBBON: ["MA #1", "MA #2", "MA #3", "MA #4", "MA #5", "MA #6"],
  BOLL: ["Período", "Desvios padrão"],
  SAR: ["Aceleração inicial (×0,01)", "Passo (×0,01)", "Máximo (×0,01)"],
  BBI: ["Média 1", "Média 2", "Média 3", "Média 4"],
  ICHIMOKU: ["Tenkan", "Kijun", "Senkou B"],
  VOLUME_PROFILE: ["Linhas de preço"],
  VOL: ["Média 1 do volume", "Média 2 do volume", "Média 3 do volume"],
  MACD: ["Rápida", "Lenta", "Sinal"],
  RSI: ["RSI 1 — período", "RSI 2 — período", "RSI 3 — período"],
  RSI_DIV: ["Período do RSI"],
  STOCH_RSI: ["Período do RSI", "Período do estocástico", "Suavização %K", "Suavização %D"],
  KDJ: ["Período", "Suavização K", "Suavização D"],
  ATR: ["Período"],
  MFI: ["Período"],
  OBV: ["Média"],
  DMI: ["Período", "Suavização do ADX"],
  CCI: ["Período"],
  WR: ["Período 1", "Período 2", "Período 3"],
  MTM: ["Período", "Média"],
  ROC: ["Período", "Média"],
  TRIX: ["Período", "Sinal"],
  AO: ["Curta", "Longa"],
};

export type Figure = { key: string; title: string; line: boolean; color: string };
export type MenuTarget = { index: number; x: number; y: number };

export function IndicatorMenu({
  target,
  indicators,
  favorites,
  onClose,
  onSettings,
  onChange,
  onFavorite,
}: {
  target: MenuTarget | null;
  indicators: IndicatorState[];
  favorites: string[];
  onClose: () => void;
  onSettings: (index: number) => void;
  onChange: (next: IndicatorState[]) => void;
  onFavorite: (name: string) => void;
}) {
  const ind = target ? indicators[target.index] : undefined;
  if (!target || !ind) return null;
  const i = target.index;
  const label = indicatorLabel(ind.name);
  const patch = (p: Partial<IndicatorState>) => onChange(indicators.map((x, j) => (j === i ? { ...x, ...p } : x)));
  // Painéis existentes (outros indicadores fora do preço), para "Mover para".
  const panes = indicators
    .map((x, j) => ({ x, j }))
    .filter(({ x, j }) => x.pane === "sub" && j !== i && !(ind.paneKey && x.paneKey === ind.paneKey))
    .map(({ x }) => ({ key: x.paneKey ?? x.id ?? "", label: indicatorLabel(x.name) }))
    .filter((p) => p.key);
  const order = (to: "front" | "back" | "forward" | "backward") => {
    const list = [...indicators];
    const [item] = list.splice(i, 1);
    const j = to === "front" ? list.length : to === "back" ? 0 : to === "forward" ? Math.min(list.length, i + 1) : Math.max(0, i - 1);
    list.splice(j, 0, item);
    onChange(list);
  };
  const isFav = favorites.includes(ind.name);
  return (
    <DropdownMenu open onOpenChange={(v) => !v && onClose()}>
      <DropdownMenuTrigger asChild>
        <span aria-hidden className="pointer-events-none fixed size-px" style={{ left: target.x, top: target.y }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60" aria-label={`Opções de ${label}`} onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuItem onSelect={() => onFavorite(ind.name)}>
          <Star className={cn(isFav && "fill-amber-400 text-amber-400")} /> {isFav ? "Tirar dos favoritos" : "Favoritar este indicador"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Layers /> Ordem visual
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => order("front")}>Trazer para a frente</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => order("back")}>Enviar para trás</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => order("forward")}>Avançar uma camada</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => order("backward")}>Recuar uma camada</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <MoveVertical /> Mover para
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem disabled={ind.pane === "main"} onSelect={() => patch({ pane: "main", paneKey: undefined })}>
              Gráfico principal (sobre o preço)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => patch({ pane: "sub", paneKey: undefined })}>Novo painel abaixo</DropdownMenuItem>
            {panes.map((p) => (
              <DropdownMenuItem key={p.key} onSelect={() => moveToPane(indicators, i, p.key, onChange)}>
                Painel de {p.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={indicators.length >= LIMITS.indicatorsPerPane}
          onSelect={() => onChange([...indicators.slice(0, i + 1), { ...structuredClone(ind), id: newIndicatorId() }, ...indicators.slice(i + 1)])}
        >
          <Copy /> Copiar
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => patch({ visible: ind.visible === false })}>
          {ind.visible === false ? <Eye /> : <EyeOff />} {ind.visible === false ? "Mostrar" : "Ocultar"}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => window.confirm(`Apagar ${label} deste gráfico?`) && onChange(indicators.filter((_, j) => j !== i))}
        >
          <Trash2 /> Apagar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onSettings(i)}>
          <Settings2 /> Configurações…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const newIndicatorId = () => `i-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Põe o indicador no mesmo painel de outro (o painel ganha uma chave, se ainda não tiver). */
function moveToPane(list: IndicatorState[], i: number, key: string, onChange: (l: IndicatorState[]) => void) {
  onChange(
    list.map((x, j) => {
      if (j === i) return { ...x, pane: "sub", paneKey: key };
      // O indicador que já estava sozinho no painel passa a usar a chave (o id dele).
      if (x.pane === "sub" && !x.paneKey && x.id === key) return { ...x, paneKey: key };
      return x;
    }),
  );
}

type Tab = "inputs" | "style" | "visibility";

export function IndicatorSettingsDialog({
  indicator,
  figures,
  open,
  onClose,
  onApply,
}: {
  indicator: IndicatorState | null;
  figures: Figure[];
  open: boolean;
  onClose: () => void;
  onApply: (next: IndicatorState) => void;
}) {
  return (
    <Dialog open={open && !!indicator} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        {indicator && <IndicatorSettingsForm key={indicator.id} indicator={indicator} figures={figures} onClose={onClose} onApply={onApply} />}
      </DialogContent>
    </Dialog>
  );
}

function IndicatorSettingsForm({
  indicator,
  figures,
  onClose,
  onApply,
}: {
  indicator: IndicatorState;
  figures: Figure[];
  onClose: () => void;
  onApply: (next: IndicatorState) => void;
}) {
  const [tab, setTab] = useState<Tab>("inputs");
  const [draft, setDraft] = useState<IndicatorState>(structuredClone(indicator));
  const labels = PARAM_LABELS[draft.name] ?? [];
  const isRibbon = draft.name === "MA_RIBBON";
  const setParam = (i: number, v: number) => setDraft((d) => ({ ...d, params: d.params.map((p, j) => (j === i ? v : p)) }));
  const setSeries = (key: string, patch: Partial<SeriesStyle>) =>
    setDraft((d) => ({ ...d, styles: { ...d.styles, [key]: { ...d.styles?.[key], ...patch } } }));
  const setLegend = (k: "name" | "params" | "values", v: boolean) => setDraft((d) => ({ ...d, legend: { ...d.legend, [k]: v } }));
  const lines = figures.filter((f) => f.line);
  const tabs: { id: Tab; label: string }[] = [
    ...(draft.params.length ? [{ id: "inputs" as const, label: "Entradas" }] : []),
    { id: "style", label: "Estilo" },
    { id: "visibility", label: "Visibilidade" },
  ];
  const current = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{indicatorLabel(draft.name)}</DialogTitle>
      </DialogHeader>
      <div role="tablist" aria-label="Configurações do indicador" className="flex gap-4 border-b text-sm">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={current === t.id}
            onClick={() => setTab(t.id)}
            className={cn("-mb-px border-b-2 border-transparent pb-2 text-muted-foreground", current === t.id && "border-foreground font-semibold text-foreground")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex max-h-[55vh] min-h-40 flex-col gap-3 overflow-auto py-1 text-sm">
        {current === "inputs" &&
          draft.params.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-44 shrink-0 text-muted-foreground">{labels[i] ?? `Parâmetro ${i + 1}`}</span>
              {isRibbon && (
                <select
                  aria-label={`Tipo da média ${i + 1}`}
                  value={draft.options?.types?.[i] ?? "EMA"}
                  onChange={(e) =>
                    setDraft((d) => {
                      const types = d.params.map((_, j) => d.options?.types?.[j] ?? "EMA");
                      types[i] = e.target.value as MaType;
                      return { ...d, options: { ...d.options, types } };
                    })
                  }
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                >
                  {MA_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              )}
              <NumberInput label={labels[i] ?? `Parâmetro ${i + 1}`} value={p} min={0.01} max={10_000} step="any" onChange={(v) => setParam(i, v)} />
            </div>
          ))}
        {current === "style" && (
          <>
            {lines.map((f) => {
              const st = draft.styles?.[f.key] ?? {};
              return (
                <div key={f.key} className="flex items-center gap-2">
                  <input type="checkbox" aria-label={`Mostrar ${f.title || f.key}`} checked={st.visible !== false} onChange={(e) => setSeries(f.key, { visible: e.target.checked })} />
                  <span className="w-28 shrink-0 truncate">{f.title || f.key}</span>
                  <ColorPicker label={`Cor de ${f.title || f.key}`} value={st.color ?? f.color} onChange={(color) => setSeries(f.key, { color })} />
                  <WidthMenu value={st.size ?? 1} onChange={(size) => setSeries(f.key, { size })} />
                  <StyleMenu value={st.style ?? "solid"} onChange={(style) => setSeries(f.key, { style })} />
                </div>
              );
            })}
            {!lines.length && <p className="text-muted-foreground">Este indicador não tem linhas configuráveis (barras e desenhos próprios usam as cores padrão).</p>}
          </>
        )}
        {current === "visibility" && (
          <>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.visible !== false} onChange={(e) => setDraft((d) => ({ ...d, visible: e.target.checked }))} /> Mostrar o indicador no gráfico
            </label>
            <p className="mt-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Legenda (o cálculo continua)</p>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.legend?.name !== false} onChange={(e) => setLegend("name", e.target.checked)} /> Nome
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.legend?.params !== false} onChange={(e) => setLegend("params", e.target.checked)} /> Parâmetros
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.legend?.values !== false} onChange={(e) => setLegend("values", e.target.checked)} /> Valores
            </label>
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          onClick={() => {
            onApply(draft);
            onClose();
          }}
        >
          Ok
        </Button>
      </div>
    </>
  );
}
