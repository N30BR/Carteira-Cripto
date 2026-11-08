"use client";

// Menus e configurações dos indicadores (ícones ao lado do nome no gráfico).
import { useState } from "react";
import { Copy, Eye, EyeOff, Layers, MoveVertical, Settings2, Star, Trash2, Undo2 } from "lucide-react";
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
import {
  CHART_INDICATORS,
  DELTA_MODES,
  LIMITS,
  MA_TYPES,
  PRICE_SOURCES,
  type DeltaMode,
  type IndicatorState,
  type MaType,
  type PriceSource,
  type SeriesStyle,
  factoryIndicatorVisual,
} from "@/lib/charts/workspace";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ColorPicker, NumberInput, SETTINGS_BODY, SETTINGS_DIALOG, StyleMenu, WidthMenu } from "./object-ui";

export const indicatorLabel = (name: string) => CHART_INDICATORS.find((c) => c.name === name)?.label ?? name;

/** Nome de cada parâmetro (Entradas). Indicadores sem nomes aqui mostram "Parâmetro n". */
const PARAM_LABELS: Record<string, string[]> = {
  MA: ["MA 1 — período", "MA 2 — período", "MA 3 — período", "MA 4 — período"],
  EMA: ["EMA 1 — período", "EMA 2 — período", "EMA 3 — período"],
  SMA: ["Período", "Peso"],
  MA_RIBBON: ["MA #1", "MA #2", "MA #3", "MA #4", "MA #5", "MA #6"],
  MA_RIBBON_NEO: ["MA #1", "MA #2", "MA #3", "MA #4", "MA #5", "MA #6", "MA #7", "MA #8"],
  BOLL: ["Período", "Desvios padrão"],
  SAR: ["Aceleração inicial (×0,01)", "Passo (×0,01)", "Máximo (×0,01)"],
  BBI: ["Média 1", "Média 2", "Média 3", "Média 4"],
  ICHIMOKU: ["Tenkan", "Kijun", "Senkou B"],
  VOLUME_PROFILE: ["Linhas de preço", "Área de valor (%)"],
  BMSB: ["SMA (semanas)", "EMA (semanas)"],
  PI_CYCLE: ["Média rápida (dias)", "Média lenta (dias, ×2)"],
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

/** Indicadores com níveis de referência editáveis (de 0 a 100, até 5). */
const LEVELS = new Set(["RSI", "RSI_DIV"]);

export type Figure = { key: string; title: string; line: boolean; color: string; size?: number; style?: "solid" | "dashed" | "dotted" };

/** Médias com tipo por linha e fonte do preço (Entradas: "MA #1 [tipo] [período]"); valor = tipo padrão. */
const RIBBONS: Record<string, MaType> = { MA_RIBBON: "EMA", MA_RIBBON_NEO: "SMA" };
const SOURCE_LABEL: Record<PriceSource, string> = {
  close: "Fechamento",
  open: "Abertura",
  high: "Máxima",
  low: "Mínima",
  hl2: "(Máx+Mín)/2",
  hlc3: "(Máx+Mín+Fech)/3",
  ohlc4: "(Abe+Máx+Mín+Fech)/4",
};
/** Indicadores com cores próprias de alta/baixa (ou compra/venda). */
const SIDE_COLORS: Record<string, { up: string; down: string; upLabel: string; downLabel: string }> = {
  DELTA: { up: "#22c55e", down: "#ef4444", upLabel: "Delta positivo", downLabel: "Delta negativo" },
  VOLUME_PROFILE: { up: "#22c55e", down: "#ef4444", upLabel: "Compras", downLabel: "Vendas" },
};
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
          onSelect={() => onChange(indicators.filter((_, j) => j !== i))}
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
      <DialogContent className={SETTINGS_DIALOG}>
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
  const ribbonDefault = RIBBONS[draft.name];
  const isRibbon = !!ribbonDefault;
  const sides = SIDE_COLORS[draft.name];
  const setOption = (patch: Partial<NonNullable<IndicatorState["options"]>>) => setDraft((d) => ({ ...d, options: { ...d.options, ...patch } }));
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
      <div className={cn("flex max-h-[55vh] min-h-40 flex-col gap-3 py-1 text-sm", SETTINGS_BODY)}>
        {current === "inputs" && LEVELS.has(draft.name) && (
          <div className="flex items-center gap-2">
            <span className="w-44 shrink-0 text-muted-foreground">Níveis de referência</span>
            <Input
              aria-label="Níveis de referência"
              className="h-8 w-40 text-sm"
              defaultValue={(draft.options?.levels ?? [30, 50, 70]).join(", ")}
              onKeyDown={(e) => e.stopPropagation()}
              onChange={(e) => {
                const levels = e.target.value
                  .split(",")
                  .map((x) => Number(x.trim()))
                  .filter((n) => Number.isFinite(n) && n >= 0 && n <= 100)
                  .slice(0, 5);
                setDraft((d) => ({ ...d, options: { ...d.options, levels } }));
              }}
            />
          </div>
        )}
        {current === "inputs" && isRibbon && (
          <div className="flex items-center gap-2">
            <span className="w-44 shrink-0 text-muted-foreground">Fonte do preço</span>
            <select
              aria-label="Fonte do preço"
              value={draft.options?.source ?? "close"}
              onChange={(e) => setOption({ source: e.target.value as PriceSource })}
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              {PRICE_SOURCES.map((src) => (
                <option key={src} value={src}>
                  {SOURCE_LABEL[src]}
                </option>
              ))}
            </select>
          </div>
        )}
        {current === "inputs" &&
          draft.params.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              {isRibbon && lines[i] && (
                <input
                  type="checkbox"
                  aria-label={`Mostrar ${labels[i] ?? `média ${i + 1}`}`}
                  checked={draft.styles?.[lines[i].key]?.visible !== false}
                  onChange={(e) => setSeries(lines[i].key, { visible: e.target.checked })}
                />
              )}
              <span className={cn("shrink-0 text-muted-foreground", isRibbon ? "w-16" : "w-44")}>{labels[i] ?? `Parâmetro ${i + 1}`}</span>
              {isRibbon && (
                <select
                  aria-label={`Tipo da média ${i + 1}`}
                  value={draft.options?.types?.[i] ?? ribbonDefault}
                  onChange={(e) =>
                    setDraft((d) => {
                      const types = d.params.map((_, j) => d.options?.types?.[j] ?? ribbonDefault);
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
            {sides && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-28 shrink-0">{sides.upLabel}</span>
                  <ColorPicker label={`Cor: ${sides.upLabel}`} value={draft.options?.upColor ?? sides.up} onChange={(upColor) => setOption({ upColor })} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-28 shrink-0">{sides.downLabel}</span>
                  <ColorPicker label={`Cor: ${sides.downLabel}`} value={draft.options?.downColor ?? sides.down} onChange={(downColor) => setOption({ downColor })} />
                </div>
                {draft.name === "DELTA" && (
                  <div className="flex items-center gap-2">
                    <span className="w-28 shrink-0">Representação</span>
                    <select
                      aria-label="Representação"
                      value={draft.options?.mode ?? "columns"}
                      onChange={(e) => setOption({ mode: e.target.value as DeltaMode })}
                      className="h-8 rounded-md border bg-background px-2 text-sm"
                    >
                      {DELTA_MODES.map((m) => (
                        <option key={m} value={m}>
                          {m === "columns" ? "Colunas" : "Linha"}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {draft.name === "DELTA" && (
                  <p className="text-xs text-muted-foreground">
                    Delta por vela = compras agressoras − vendas agressoras, com o volume comprador (taker buy) que a Binance informa em cada vela. Não é
                    o fluxo por nível de preço (footprint), que exigiria cada negócio. Para o acumulado, use o indicador CVD.
                  </p>
                )}
                {draft.name === "VOLUME_PROFILE" && (
                  <p className="text-xs text-muted-foreground">
                    Distribuição por preço estimada (OHLCV); a divisão compra/venda usa o volume comprador agressor de cada vela (Binance).
                  </p>
                )}
              </div>
            )}
            {lines.map((f) => {
              const st = draft.styles?.[f.key] ?? {};
              return (
                <div key={f.key} className="flex items-center gap-2">
                  <input type="checkbox" aria-label={`Mostrar ${f.title || f.key}`} checked={st.visible !== false} onChange={(e) => setSeries(f.key, { visible: e.target.checked })} />
                  <span className="w-28 shrink-0 truncate">{f.title || f.key}</span>
                  <ColorPicker label={`Cor de ${f.title || f.key}`} value={st.color ?? f.color} onChange={(color) => setSeries(f.key, { color })} />
                  <WidthMenu value={st.size ?? f.size ?? 1} onChange={(size) => setSeries(f.key, { size })} />
                  <StyleMenu value={st.style ?? f.style ?? "solid"} onChange={(style) => setSeries(f.key, { style })} />
                </div>
              );
            })}
            {!lines.length && !sides && <p className="text-muted-foreground">Este indicador não tem linhas configuráveis (barras e desenhos próprios usam as cores padrão).</p>}
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
        {/* Só com visual configurável: volta cores/espessuras/traços aos de fábrica (períodos e opções não mudam). */}
        {(lines.length > 0 || !!sides) && (
          <Button variant="ghost" className="mr-auto" title="Restaurar o visual de fábrica deste indicador" onClick={() => setDraft((d) => factoryIndicatorVisual(d))}>
            <Undo2 /> Padrão
          </Button>
        )}
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
