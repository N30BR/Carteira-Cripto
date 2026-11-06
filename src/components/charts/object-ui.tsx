"use client";

// Edição de desenhos: barra rápida (clique esquerdo), configurações completas (clique direito)
// e lista de desenhos (para mostrar de novo os ocultos).
import { useState } from "react";
import { Copy, Eye, EyeOff, GripVertical, Layers, Lock, LockOpen, MoreHorizontal, Pencil, Plus, Settings2, Trash2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { DEFAULT_FIB_LEVELS } from "@/lib/charts/drawing";
import {
  CHART_TOOLS,
  ELLIOTT_LABELS,
  EXTENDS,
  LABEL_POSITIONS,
  type ExtendName,
  type FibLevel,
  type LabelPosition,
  type LineStyleName,
  type OverlayState,
  type OverlayStyleState,
} from "@/lib/charts/workspace";
import { cn } from "@/lib/utils";

const TOOL_LABEL = Object.fromEntries(CHART_TOOLS.map((t) => [t.name, t.label]));
export const toolLabel = (name: string) => TOOL_LABEL[name] ?? name;
const DEFAULT_COLOR = "#8b7cf6";
const TEXT_TOOLS = new Set(["simpleAnnotation", "simpleTag"]);
const ELLIOTT_UP = "#22c55e";
const ELLIOTT_DOWN = "#ef4444";
const isElliott = (name: string) => name in ELLIOTT_LABELS;
const POSITION_LABEL: Record<LabelPosition, string> = { auto: "Automática (topos em cima, fundos embaixo)", above: "Sempre acima do ponto", below: "Sempre abaixo do ponto" };

// ---------- Cor (paleta + opacidade) ----------
const PALETTE = [
  ["#ffffff", "#d1d4dc", "#b2b5be", "#9598a1", "#787b86", "#5d606b", "#434651", "#2a2e39", "#131722", "#000000"],
  ["#f23645", "#ff9800", "#ffeb3b", "#4caf50", "#089981", "#00bcd4", "#2962ff", "#673ab7", "#9c27b0", "#e91e63"],
  ["#fccbcd", "#ffe0b2", "#fff9c4", "#c8e6c9", "#ace5dc", "#b2ebf2", "#bbd9fb", "#d1c4e9", "#e1bee7", "#f8bbd0"],
  ["#faa1a4", "#ffcc80", "#fff59d", "#a5d6a7", "#70ccbd", "#80deea", "#90bff9", "#b39ddb", "#ce93d8", "#f48fb1"],
  ["#f7525f", "#ffb74d", "#fff176", "#81c784", "#42bda8", "#4dd0e1", "#5b9cf6", "#9575cd", "#ba68c8", "#f06292"],
  ["#b22833", "#f57c00", "#fbc02d", "#388e3c", "#056656", "#0097a7", "#1848cc", "#512da8", "#7b1fa2", "#c2185b"],
];
const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, "0");
const opacityOf = (c: string) => (c.length === 9 ? Math.round((parseInt(c.slice(7), 16) / 255) * 100) : 100);
const withOpacity = (c: string, pct: number) => (pct >= 100 ? c.slice(0, 7) : `${c.slice(0, 7)}${hex2((pct / 100) * 255)}`);

export function ColorPicker({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  const [custom, setCustom] = useState("");
  const opacity = opacityOf(value);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={label} title={label} className="grid size-8 place-items-center rounded border hover:bg-muted">
          <span className="size-4 rounded-sm border" style={{ background: value }} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 p-2" onCloseAutoFocus={(e) => e.preventDefault()}>
        <div className="grid grid-cols-10 gap-1">
          {PALETTE.flat().map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Cor ${c}`}
              onClick={() => onChange(withOpacity(c, opacity))}
              className={cn("size-5 rounded-sm border border-white/10", value.slice(0, 7).toLowerCase() === c && "ring-2 ring-white")}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Plus className="size-4 text-muted-foreground" />
          <Input
            aria-label="Cor personalizada (#rrggbb)"
            placeholder="#rrggbb"
            className="h-7 text-xs"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && /^#[0-9a-fA-F]{6}$/.test(custom)) onChange(withOpacity(custom, opacity));
            }}
          />
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          Opacidade
          <input
            type="range"
            min={5}
            max={100}
            value={opacity}
            aria-label="Opacidade"
            onChange={(e) => onChange(withOpacity(value, Number(e.target.value)))}
            className="flex-1"
          />
          <span className="w-9 text-right">{opacity}%</span>
        </label>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const STYLE_LABEL: Record<LineStyleName, string> = { solid: "Linha", dashed: "Tracejada", dotted: "Pontilhada" };
const dashCss = (s: LineStyleName) => (s === "solid" ? "solid" : s === "dashed" ? "dashed" : "dotted");

export function WidthMenu({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Espessura" title="Espessura" className="flex h-8 items-center gap-1.5 rounded px-2 text-xs hover:bg-muted">
          <span className="w-4 bg-current" style={{ height: Math.min(4, value) }} /> {value}px
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
        {[1, 2, 3, 4].map((n) => (
          <DropdownMenuItem key={n} onSelect={() => onChange(n)} className={cn(value === n && "bg-muted")}>
            <span className="w-6 bg-current" style={{ height: n }} /> {n}px
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function StyleMenu({ value, onChange }: { value: LineStyleName; onChange: (s: LineStyleName) => void }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Estilo do traço" title="Estilo do traço" className="grid h-8 w-9 place-items-center rounded hover:bg-muted">
          <span className="w-5 border-t-2 border-current" style={{ borderTopStyle: dashCss(value) }} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
        {(["solid", "dashed", "dotted"] as const).map((s) => (
          <DropdownMenuItem key={s} onSelect={() => onChange(s)} className={cn(value === s && "bg-muted")}>
            <span className="w-6 border-t-2 border-current" style={{ borderTopStyle: dashCss(s) }} /> {STYLE_LABEL[s]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------- Barra rápida (desenho selecionado) ----------
export type ObjectActions = {
  update: (patch: Partial<OverlayState>) => void;
  settings: () => void;
  duplicate: () => void;
  hide: () => void;
  remove: () => void;
  order: (to: "front" | "back" | "forward" | "backward") => void;
};

export function ObjectToolbar({ object, actions }: { object: OverlayState; actions: ObjectActions }) {
  const st = object.styles ?? {};
  const setStyle = (patch: Partial<OverlayStyleState>) => actions.update({ styles: patch });
  const isText = TEXT_TOOLS.has(object.name);
  return (
    <div
      role="toolbar"
      aria-label={`Editar ${toolLabel(object.name)}`}
      data-testid="object-toolbar"
      // A barra fica fora da área do gráfico (o canvas não recebe o clique). Não interromper o evento aqui:
      // os seletores abertos a partir dela precisam vê-lo para saber que o clique foi dentro deles.
      className="absolute top-14 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border bg-popover/95 px-1 py-0.5 shadow-lg backdrop-blur"
    >
      <GripVertical className="size-4 text-muted-foreground/60" aria-hidden />
      {isElliott(object.name) ? (
        // Ondas de Elliott: cor dos segmentos de alta e de baixa.
        <span className="flex items-center gap-1 px-1">
          <Pencil className="size-3.5 text-muted-foreground" aria-hidden />
          <ColorPicker label="Cor das ondas de alta" value={st.buyColor ?? ELLIOTT_UP} onChange={(buyColor) => setStyle({ buyColor })} />
          <ColorPicker label="Cor das ondas de baixa" value={st.sellColor ?? ELLIOTT_DOWN} onChange={(sellColor) => setStyle({ sellColor })} />
        </span>
      ) : (
        <span className="flex items-center gap-1 px-1">
          <Pencil className="size-3.5 text-muted-foreground" aria-hidden />
          <ColorPicker label="Cor da linha" value={st.color ?? DEFAULT_COLOR} onChange={(color) => setStyle({ color })} />
        </span>
      )}
      {isText && (
        <span className="flex items-center gap-1 px-1">
          <Type className="size-3.5 text-muted-foreground" aria-hidden />
          <ColorPicker label="Cor do texto" value={st.textColor ?? "#ffffff"} onChange={(textColor) => setStyle({ textColor })} />
        </span>
      )}
      <WidthMenu value={st.size ?? (isElliott(object.name) ? 2 : 1)} onChange={(size) => setStyle({ size })} />
      <StyleMenu value={st.style ?? "solid"} onChange={(style) => setStyle({ style })} />
      <ToolbarButton label="Configurações" onClick={actions.settings}>
        <Settings2 />
      </ToolbarButton>
      <ToolbarButton label={object.locked ? "Desbloquear" : "Bloquear"} onClick={() => actions.update({ locked: !object.locked })} pressed={!!object.locked}>
        {object.locked ? <Lock /> : <LockOpen />}
      </ToolbarButton>
      <ToolbarButton label="Excluir (Delete)" onClick={actions.remove}>
        <Trash2 />
      </ToolbarButton>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Mais opções" title="Mais opções" className="grid size-8 place-items-center rounded hover:bg-muted [&_svg]:size-4">
            <MoreHorizontal />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Layers /> Ordem visual
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={() => actions.order("front")}>Trazer para a frente</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => actions.order("back")}>Enviar para trás</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => actions.order("forward")}>Avançar uma camada</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => actions.order("backward")}>Recuar uma camada</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={actions.duplicate}>
            <Copy /> Duplicar <DropdownMenuShortcut>Ctrl+D</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={actions.hide}>
            <EyeOff /> Ocultar <DropdownMenuShortcut>Ctrl+O</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ToolbarButton({ label, onClick, pressed, children }: { label: string; onClick: () => void; pressed?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn("grid size-8 place-items-center rounded hover:bg-muted [&_svg]:size-4", pressed && "bg-muted text-amber-400")}
    >
      {children}
    </button>
  );
}

// ---------- Configurações completas (clique direito) ----------
type Tab = "style" | "text" | "coords" | "visibility";
const EXTEND_LABEL: Record<ExtendName, string> = { none: "Não estender", left: "Para a esquerda", right: "Para a direita", both: "Para os dois lados" };

export function ObjectSettingsDialog({
  object,
  open,
  onClose,
  onApply,
}: {
  object: OverlayState | null;
  open: boolean;
  onClose: () => void;
  onApply: (patch: Partial<OverlayState>) => void;
}) {
  return (
    <Dialog open={open && !!object} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        {/* Recria o formulário a cada desenho aberto (valores atuais). */}
        {object && <ObjectSettingsForm key={object.id} object={object} onClose={onClose} onApply={onApply} />}
      </DialogContent>
    </Dialog>
  );
}

function ObjectSettingsForm({ object, onClose, onApply }: { object: OverlayState; onClose: () => void; onApply: (patch: Partial<OverlayState>) => void }) {
  const [tab, setTab] = useState<Tab>("style");
  const [st, setSt] = useState<OverlayStyleState>({
    ...object.styles,
    ...(object.name === "fibonacciLine" ? { levels: object.styles?.levels ?? DEFAULT_FIB_LEVELS } : {}),
  });
  const [textValue, setTextValue] = useState(object.text ?? "");
  const [points, setPoints] = useState(object.points);
  const [visible, setVisible] = useState(object.visible !== false);
  const [locked, setLocked] = useState(!!object.locked);
  const isText = TEXT_TOOLS.has(object.name);
  const tabs: { id: Tab; label: string }[] = [
    { id: "style", label: "Estilo" },
    ...(isText ? [{ id: "text" as const, label: "Texto" }] : []),
    { id: "coords", label: "Coordenadas" },
    { id: "visibility", label: "Visibilidade" },
  ];
  const set = (patch: Partial<OverlayStyleState>) => setSt((s) => ({ ...s, ...patch }));
  const setLevel = (i: number, patch: Partial<FibLevel>) => set({ levels: (st.levels ?? []).map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const apply = () => {
    const trimmed = textValue.slice(0, 200).trim();
    onApply({ styles: st, points, visible, locked, ...(isText && trimmed ? { text: trimmed } : {}) });
    onClose();
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>{toolLabel(object.name)}</DialogTitle>
      </DialogHeader>
      <div role="tablist" aria-label="Configurações do desenho" className="flex gap-4 border-b text-sm">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn("-mb-px border-b-2 border-transparent pb-2 text-muted-foreground", tab === t.id && "border-foreground font-semibold text-foreground")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex max-h-[55vh] min-h-48 flex-col gap-3 overflow-auto py-1 text-sm">
        {tab === "style" && (
          <>
            <Row label="Linha">
              {isElliott(object.name) ? (
                <>
                  <ColorPicker label="Cor das ondas de alta" value={st.buyColor ?? ELLIOTT_UP} onChange={(buyColor) => set({ buyColor })} />
                  <ColorPicker label="Cor das ondas de baixa" value={st.sellColor ?? ELLIOTT_DOWN} onChange={(sellColor) => set({ sellColor })} />
                </>
              ) : (
                <ColorPicker label="Cor da linha" value={st.color ?? DEFAULT_COLOR} onChange={(color) => set({ color })} />
              )}
              <WidthMenu value={st.size ?? (isElliott(object.name) ? 2 : 1)} onChange={(size) => set({ size })} />
              <StyleMenu value={st.style ?? "solid"} onChange={(style) => set({ style })} />
            </Row>
            {isElliott(object.name) && (
              <>
                <p className="text-xs text-muted-foreground">Verde/vermelho indicam a direção de cada segmento (sobe/desce), não validam a contagem.</p>
                <Row label="Rótulos">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={st.showLabels !== false} onChange={(e) => set({ showLabels: e.target.checked })} /> Mostrar
                  </label>
                  <NumberInput label="Tamanho dos rótulos" value={st.labelSize ?? 13} min={8} max={28} step={1} onChange={(n) => set({ labelSize: Math.round(n) })} />
                </Row>
                <Row label="Posição">
                  <select
                    aria-label="Posição dos rótulos"
                    value={st.labelPosition ?? "auto"}
                    onChange={(e) => set({ labelPosition: e.target.value as LabelPosition })}
                    className="h-8 rounded-md border bg-background px-2 text-sm"
                  >
                    {LABEL_POSITIONS.map((p) => (
                      <option key={p} value={p}>
                        {POSITION_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="Textos">
                  {ELLIOTT_LABELS[object.name].map((def, i) => (
                    <Input
                      key={i}
                      aria-label={`Rótulo ${i + 1}`}
                      className="h-8 w-12 text-center text-sm"
                      maxLength={6}
                      placeholder={def}
                      value={st.labels?.[i] ?? ""}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\p{L}\p{N}().\- ]/gu, "").slice(0, 6);
                        const labels = ELLIOTT_LABELS[object.name].map((_, j) => (j === i ? v : (st.labels?.[j] ?? "")));
                        set({ labels: labels.some(Boolean) ? labels : undefined });
                      }}
                    />
                  ))}
                </Row>
                <Row label="Pontos">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={st.showPoints !== false} onChange={(e) => set({ showPoints: e.target.checked })} /> Mostrar marcadores
                  </label>
                </Row>
              </>
            )}
            {object.name === "segment" && (
              <Row label="Estender">
                <select
                  aria-label="Estender"
                  value={st.extend ?? "none"}
                  onChange={(e) => set({ extend: e.target.value as ExtendName })}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                >
                  {EXTENDS.map((x) => (
                    <option key={x} value={x}>
                      {EXTEND_LABEL[x]}
                    </option>
                  ))}
                </select>
              </Row>
            )}
            {object.name === "fixedRangeVolumeProfile" && (
              <>
                <Row label="Linhas de preço">
                  <NumberInput label="Linhas de preço" value={st.rows ?? 24} min={4} max={200} step={1} onChange={(rows) => set({ rows: Math.round(rows) })} />
                </Row>
                <Row label="Área de valor (%)">
                  <NumberInput label="Área de valor (%)" value={st.valueArea ?? 70} min={10} max={100} step={1} onChange={(valueArea) => set({ valueArea })} />
                </Row>
                <Row label="Compras / vendas">
                  <ColorPicker label="Cor das compras" value={st.buyColor ?? "#22c55e"} onChange={(buyColor) => set({ buyColor })} />
                  <ColorPicker label="Cor das vendas" value={st.sellColor ?? "#ef4444"} onChange={(sellColor) => set({ sellColor })} />
                </Row>
                <p className="text-xs text-muted-foreground">
                  Estimado: com velas OHLCV, o volume de cada vela é repartido por igual entre a mínima e a máxima (não é o volume exato negociado em cada
                  preço). A divisão compra/venda usa o volume comprador agressor de cada vela informado pela Binance; não é o fluxo real por nível de preço.
                </p>
              </>
            )}
            {object.name === "fibonacciLine" && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Níveis (1º clique = 1, 2º clique = 0)</p>
                {(st.levels ?? []).map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="checkbox" aria-label={`Mostrar nível ${l.value}`} checked={l.visible} onChange={(e) => setLevel(i, { visible: e.target.checked })} />
                    <NumberInput label={`Valor do nível ${i + 1}`} value={l.value} min={-10} max={10} step={0.001} onChange={(value) => setLevel(i, { value })} />
                    <ColorPicker label={`Cor do nível ${l.value}`} value={l.color} onChange={(color) => setLevel(i, { color })} />
                    <Button size="icon-sm" variant="ghost" aria-label={`Remover nível ${l.value}`} onClick={() => set({ levels: (st.levels ?? []).filter((_, j) => j !== i) })}>
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={(st.levels ?? []).length >= 24}
                    onClick={() => set({ levels: [...(st.levels ?? []), { value: 1.618, color: "#2962ff", visible: true }] })}
                  >
                    <Plus /> Nível
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => set({ levels: DEFAULT_FIB_LEVELS })}>
                    Restaurar padrão
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        {tab === "text" && (
          <>
            <Row label="Cor do texto">
              <ColorPicker label="Cor do texto" value={st.textColor ?? "#ffffff"} onChange={(textColor) => set({ textColor })} />
            </Row>
            <Input aria-label="Texto" maxLength={200} value={textValue} onChange={(e) => setTextValue(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          </>
        )}
        {tab === "coords" &&
          points.map((p, i) => (
            <div key={i} className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">Ponto {i + 1}</p>
              <div className="flex items-center gap-2">
                <NumberInput label={`Preço do ponto ${i + 1}`} value={p.value} step="any" onChange={(value) => setPoints((ps) => ps.map((x, j) => (j === i ? { ...x, value } : x)))} />
                <input
                  type="datetime-local"
                  aria-label={`Data do ponto ${i + 1}`}
                  value={toLocalInput(p.timestamp)}
                  onChange={(e) => {
                    const ts = new Date(e.target.value).getTime();
                    if (Number.isFinite(ts)) setPoints((ps) => ps.map((x, j) => (j === i ? { ...x, timestamp: ts } : x)));
                  }}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                />
              </div>
            </div>
          ))}
        {tab === "visibility" && (
          <>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Visível no gráfico
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} /> Bloqueado (não move nem edita com o mouse)
            </label>
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={apply}>Ok</Button>
      </div>
    </>
  );
}

const toLocalInput = (ts: number) => {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number | "any";
}) {
  const [raw, setRaw] = useState(String(value));
  return (
    <Input
      type="number"
      aria-label={label}
      className="h-8 w-28 text-sm"
      value={raw}
      min={min}
      max={max}
      step={step}
      onKeyDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        setRaw(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== "" && Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) onChange(n);
      }}
    />
  );
}

// ---------- Lista de desenhos (mostrar de novo os ocultos) ----------
export function ObjectsDialog({
  open,
  onClose,
  objects,
  onToggle,
  onRemove,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  objects: OverlayState[];
  onToggle: (o: OverlayState, patch: Partial<OverlayState>) => void;
  onRemove: (o: OverlayState) => void;
  onSelect: (o: OverlayState) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desenhos do gráfico ({objects.length})</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Ocultar não apaga: o desenho fica guardado e volta pelo olho.</p>
        <ul className="flex max-h-96 flex-col gap-1 overflow-auto" aria-label="Lista de desenhos">
          {[...objects].reverse().map((o) => (
            <li key={o.id} className={cn("flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50", o.visible === false && "text-muted-foreground")}>
              <span className="size-3 rounded-sm" style={{ background: o.styles?.color ?? DEFAULT_COLOR }} />
              <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => onSelect(o)}>
                {toolLabel(o.name)}
                {o.text ? ` — ${o.text}` : ""}
              </button>
              <Button size="icon-sm" variant="ghost" aria-label={o.visible === false ? `Mostrar ${toolLabel(o.name)}` : `Ocultar ${toolLabel(o.name)}`} onClick={() => onToggle(o, { visible: o.visible === false })}>
                {o.visible === false ? <EyeOff /> : <Eye />}
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={o.locked ? `Desbloquear ${toolLabel(o.name)}` : `Bloquear ${toolLabel(o.name)}`} onClick={() => onToggle(o, { locked: !o.locked })}>
                {o.locked ? <Lock /> : <LockOpen />}
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Excluir ${toolLabel(o.name)}`} onClick={() => onRemove(o)}>
                <Trash2 />
              </Button>
            </li>
          ))}
          {!objects.length && <li className="py-6 text-center text-sm text-muted-foreground">Nenhum desenho neste gráfico.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
