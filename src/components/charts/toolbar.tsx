"use client";

// Barra lateral de ferramentas em grupos (com submenu), barra de favoritos e escolha dos tempos da barra superior.
import { useState } from "react";
import {
  AlignJustify,
  Anchor,
  ArrowRight,
  ArrowUp,
  ChartBarBig,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Equal,
  GripHorizontal,
  GripVertical,
  Minus,
  MessageSquare,
  MoveDiagonal,
  MoveUpRight,
  PictureInPicture2,
  Rows3,
  ChevronsRight,
  Ruler,
  SeparatorVertical,
  Slash,
  Square,
  Star,
  Tag,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CHART_INTERVALS, type ChartInterval } from "@/lib/charts/params";
import { MAX_BAR_INTERVALS, type ToolPrefs } from "@/lib/charts/workspace";
import { cn } from "@/lib/utils";
import { toolLabel } from "./object-ui";

/** Ícone das ondas de Elliott (como a referência): zigue-zague com marcadores e as letras da 1ª e da última onda. */
function elliottIcon(first: string, last: string): LucideIcon {
  const Icon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M3 18 L8 12 L12 16 L16 10 L21 13" />
      <circle cx="8" cy="12" r="1.6" />
      <circle cx="12" cy="16" r="1.6" />
      <circle cx="16" cy="10" r="1.6" />
      <circle cx="21" cy="13" r="1.6" />
      <text x="6.5" y="7" fontSize="6.5" fill="currentColor" stroke="none" fontWeight="600">
        {first}
      </text>
      <text x="15.5" y="6" fontSize="6.5" fill="currentColor" stroke="none" fontWeight="600">
        {last}
      </text>
    </svg>
  );
  return Icon as unknown as LucideIcon;
}

export const TOOL_ICON: Record<string, LucideIcon> = {
  elliottImpulse: elliottIcon("1", "5"),
  elliottCorrection: elliottIcon("A", "C"),
  elliottTriangle: elliottIcon("A", "E"),
  elliottDoubleCombo: elliottIcon("W", "Y"),
  elliottTripleCombo: elliottIcon("W", "Z"),
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
  parallelChannel: Rows3,
  parallelStraightLine: Equal,
  priceChannelLine: Rows3,
  parallelRays: ChevronsRight,
  fibonacciLine: AlignJustify,
  rectangle: Square,
  measure: Ruler,
  fixedRangeVolumeProfile: ChartBarBig,
  anchoredVwap: Anchor,
  simpleAnnotation: MessageSquare,
  simpleTag: Tag,
};

/** Grupos da barra lateral; cada seção vira um título no submenu. */
export const TOOL_GROUPS: { id: string; label: string; sections: { title: string; tools: string[] }[] }[] = [
  {
    id: "lines",
    label: "Linhas e canais",
    sections: [
      {
        title: "Linhas",
        tools: [
          "segment",
          "rayLine",
          "straightLine",
          "horizontalStraightLine",
          "horizontalRayLine",
          "horizontalSegment",
          "verticalStraightLine",
          "verticalRayLine",
          "verticalSegment",
          "priceLine",
        ],
      },
      { title: "Canais", tools: ["parallelChannel", "parallelStraightLine", "priceChannelLine", "parallelRays"] },
    ],
  },
  {
    id: "elliott",
    label: "Ondas de Elliott",
    sections: [{ title: "Ondas de Elliott", tools: ["elliottImpulse", "elliottCorrection", "elliottTriangle", "elliottDoubleCombo", "elliottTripleCombo"] }],
  },
  { id: "fib", label: "Fibonacci", sections: [{ title: "Fibonacci", tools: ["fibonacciLine"] }] },
  { id: "shapes", label: "Formas", sections: [{ title: "Formas", tools: ["rectangle"] }] },
  { id: "measure", label: "Medição e volume", sections: [{ title: "Medição e volume", tools: ["measure", "fixedRangeVolumeProfile", "anchoredVwap"] }] },
  { id: "text", label: "Texto", sections: [{ title: "Texto", tools: ["simpleAnnotation", "simpleTag"] }] },
];

const ToolIcon = ({ tool, className }: { tool: string; className?: string }) => {
  const Icon = TOOL_ICON[tool] ?? Slash;
  return <Icon className={className ?? "size-4"} />;
};

export function ToolGroups({
  prefs,
  activeTool,
  onDraw,
  onToggleFavorite,
}: {
  prefs: ToolPrefs;
  activeTool: string | null;
  onDraw: (tool: string) => void;
  onToggleFavorite: (tool: string) => void;
}) {
  // Último usado de cada grupo (o botão do grupo desenha ele).
  const [last, setLast] = useState<Record<string, string>>({});
  return (
    <>
      {TOOL_GROUPS.map((g) => {
        const tools = g.sections.flatMap((s) => s.tools).filter((t) => prefs.visible.includes(t));
        if (!tools.length) return null;
        const current = last[g.id] && tools.includes(last[g.id]) ? last[g.id] : tools[0];
        const draw = (t: string) => {
          setLast((l) => ({ ...l, [g.id]: t }));
          onDraw(t);
        };
        return (
          <div key={g.id} className="group/tool relative">
            <button
              type="button"
              title={toolLabel(current)}
              aria-label={toolLabel(current)}
              aria-pressed={activeTool === current}
              onClick={() => draw(current)}
              className={cn(
                "grid size-8 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground",
                activeTool !== null && tools.includes(activeTool) && "bg-[#8b7cf6]/25 text-foreground",
              )}
            >
              <ToolIcon tool={activeTool && tools.includes(activeTool) ? activeTool : current} />
            </button>
            {tools.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Mais ferramentas: ${g.label}`}
                    title={`Mais ferramentas: ${g.label}`}
                    className="absolute top-1/2 -right-1.5 grid h-5 w-3 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                  >
                    <ChevronRight className="size-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start" className="w-64" onCloseAutoFocus={(e) => e.preventDefault()}>
                  {g.sections.map((s, si) => {
                    const list = s.tools.filter((t) => prefs.visible.includes(t));
                    if (!list.length) return null;
                    return (
                      <div key={s.title}>
                        {si > 0 && <DropdownMenuSeparator />}
                        <DropdownMenuLabel className="text-[11px] tracking-wide text-muted-foreground uppercase">{s.title}</DropdownMenuLabel>
                        {list.map((t) => (
                          <ToolRow key={t} tool={t} favorite={prefs.favorites.includes(t)} onDraw={() => draw(t)} onToggleFavorite={() => onToggleFavorite(t)} />
                        ))}
                      </div>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        );
      })}
    </>
  );
}

function ToolRow({ tool, favorite, onDraw, onToggleFavorite }: { tool: string; favorite: boolean; onDraw: () => void; onToggleFavorite: () => void }) {
  return (
    <div className="flex items-center rounded-sm hover:bg-muted">
      <MenuRowItem onSelect={onDraw}>
        <ToolIcon tool={tool} /> {toolLabel(tool)}
      </MenuRowItem>
      <button
        type="button"
        aria-label={favorite ? `Tirar ${toolLabel(tool)} dos favoritos` : `Adicionar ${toolLabel(tool)} aos favoritos`}
        title={favorite ? "Tirar dos favoritos" : "Adicionar aos favoritos"}
        aria-pressed={favorite}
        onClick={onToggleFavorite}
        className="mr-1 grid size-7 place-items-center rounded hover:bg-background"
      >
        <Star className={cn("size-3.5", favorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
      </button>
    </div>
  );
}

/** Item do submenu: escolher a ferramenta fecha o menu (a estrela ao lado não fecha). */
function MenuRowItem({ onSelect, children }: { onSelect: () => void; children: React.ReactNode }) {
  return (
    <DropdownMenuItem onSelect={onSelect} className="flex-1 hover:bg-transparent focus:bg-transparent">
      {children}
    </DropdownMenuItem>
  );
}

/** Barra compacta de favoritos (atalhos para as ferramentas; não duplica nada). */
export function FavoritesBar({
  prefs,
  activeTool,
  onDraw,
  floatingOn,
  onToggleFloating,
}: {
  prefs: ToolPrefs;
  activeTool: string | null;
  onDraw: (tool: string) => void;
  /** Barra flutuante (mesmos favoritos, sobre o gráfico) ligada? */
  floatingOn?: boolean;
  onToggleFloating?: () => void;
}) {
  const favorites = prefs.favorites.filter((t) => prefs.visible.includes(t));
  if (!favorites.length) return null;
  return (
    <div role="toolbar" aria-label="Ferramentas favoritas" className="flex items-center gap-0.5 rounded-md border px-1 py-0.5">
      <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
      {favorites.map((t) => (
        <button
          key={t}
          type="button"
          title={toolLabel(t)}
          aria-label={`Favorita: ${toolLabel(t)}`}
          aria-pressed={activeTool === t}
          onClick={() => onDraw(t)}
          className={cn("grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground", activeTool === t && "bg-[#8b7cf6]/25 text-foreground")}
        >
          <ToolIcon tool={t} className="size-3.5" />
        </button>
      ))}
      {onToggleFloating && (
        // Botão quadrado no fim da barra: mostra/oculta a barra flutuante com estes mesmos favoritos.
        <button
          type="button"
          title={floatingOn ? "Ocultar barra flutuante de favoritos" : "Mostrar barra flutuante de favoritos"}
          aria-label={floatingOn ? "Ocultar barra flutuante de favoritos" : "Mostrar barra flutuante de favoritos"}
          aria-pressed={!!floatingOn}
          onClick={onToggleFloating}
          className={cn(
            "ml-0.5 grid size-7 cursor-pointer place-items-center rounded-md border transition-colors [&_svg]:size-3.5",
            floatingOn ? "border-[#8b7cf6] bg-[#8b7cf6]/20 text-white hover:bg-[#8b7cf6]/30" : "border-border bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200",
          )}
        >
          <PictureInPicture2 />
        </button>
      )}
    </div>
  );
}

/**
 * Barra flutuante de favoritos: as mesmas ferramentas da barra de favoritos (mesma lista e mesma ação de desenhar),
 * sobre a área dos gráficos. Arrasta-se pela alça (os ícones só escolhem a ferramenta); fica sempre dentro da área.
 */
export function FloatingFavorites({
  prefs,
  activeTool,
  onDraw,
  pos,
  bounds,
  onMove,
}: {
  prefs: ToolPrefs;
  activeTool: string | null;
  onDraw: (tool: string) => void;
  pos: { x: number; y: number };
  /** Tamanho da área dos gráficos (px), para não sair dela. */
  bounds: { width: number; height: number };
  onMove: (pos: { x: number; y: number }) => void;
}) {
  const favorites = prefs.favorites.filter((t) => prefs.visible.includes(t));
  const [drag, setDrag] = useState<{ x: number; y: number; px: number; py: number } | null>(null);
  const [live, setLive] = useState<{ x: number; y: number } | null>(null);
  const barW = 22 + favorites.length * 30 + 8;
  const clamp = (p: { x: number; y: number }) => ({ x: Math.max(0, Math.min(Math.max(0, bounds.width - barW), p.x)), y: Math.max(0, Math.min(Math.max(0, bounds.height - 36), p.y)) });
  const at = clamp(live ?? pos);
  if (!favorites.length) return null;
  return (
    <div
      role="toolbar"
      aria-label="Barra flutuante de favoritos"
      className="absolute z-20 flex items-center gap-0.5 rounded-lg border bg-popover/95 px-1 py-1 shadow-lg"
      style={{ left: at.x, top: at.y }}
    >
      <span
        role="separator"
        aria-label="Arrastar a barra de favoritos"
        title="Arrastar"
        className="grid h-7 w-4 cursor-grab touch-none place-items-center text-muted-foreground hover:text-foreground active:cursor-grabbing [&_svg]:size-3.5"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({ x: e.clientX, y: e.clientY, px: at.x, py: at.y });
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          setLive(clamp({ x: drag.px + e.clientX - drag.x, y: drag.py + e.clientY - drag.y }));
        }}
        onPointerUp={(e) => {
          if (!drag) return;
          e.currentTarget.releasePointerCapture(e.pointerId);
          const p = clamp({ x: drag.px + e.clientX - drag.x, y: drag.py + e.clientY - drag.y });
          setDrag(null);
          setLive(null);
          onMove(p);
        }}
        onPointerCancel={() => {
          setDrag(null);
          setLive(null);
        }}
      >
        <GripVertical />
      </span>
      {favorites.map((t) => (
        <button
          key={t}
          type="button"
          title={toolLabel(t)}
          aria-label={`Flutuante: ${toolLabel(t)}`}
          aria-pressed={activeTool === t}
          onClick={() => onDraw(t)}
          className={cn("grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground", activeTool === t && "bg-[#8b7cf6]/25 text-foreground")}
        >
          <ToolIcon tool={t} className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

/** Rótulos dos tempos: 1m = minuto, 1M = mês, 1S = semana, 1A = ano. */
export const INTERVAL_LABEL: Record<ChartInterval, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "4h": "4h",
  "6h": "6h",
  "12h": "12h",
  "1d": "1D",
  "2d": "2D",
  "3d": "3D",
  "1w": "1S",
  "1M": "1M",
  "6M": "6M",
  "1y": "1A",
};
const INTERVAL_NAME: Record<ChartInterval, string> = {
  "1m": "1 minuto",
  "5m": "5 minutos",
  "15m": "15 minutos",
  "30m": "30 minutos",
  "1h": "1 hora",
  "4h": "4 horas",
  "6h": "6 horas",
  "12h": "12 horas",
  "1d": "1 dia",
  "2d": "2 dias",
  "3d": "3 dias",
  "1w": "1 semana",
  "1M": "1 mês",
  "6M": "6 meses",
  "1y": "1 ano",
};

/** Tempos da barra superior + seta para escolher quais aparecem (até 8). O tempo atual sempre aparece. */
export function IntervalBar({
  value,
  shown,
  onChange,
  onShownChange,
}: {
  value: ChartInterval;
  shown: ChartInterval[];
  onChange: (i: ChartInterval) => void;
  onShownChange: (list: ChartInterval[]) => void;
}) {
  const list = CHART_INTERVALS.filter((i) => shown.includes(i) || i === value);
  const full = shown.length >= MAX_BAR_INTERVALS;
  return (
    <div className="inline-flex items-center rounded-md border p-0.5 text-xs" role="group" aria-label="Tempo do gráfico">
      {list.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={o === value}
          title={INTERVAL_NAME[o]}
          onClick={() => onChange(o)}
          className={cn("rounded px-2 py-1 text-muted-foreground hover:text-foreground", o === value && "bg-muted font-semibold text-foreground")}
        >
          {INTERVAL_LABEL[o]}
        </button>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Personalizar tempos" title="Personalizar tempos" className="rounded px-1 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <ChevronDown className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DropdownMenuLabel>
            Tempos na barra ({shown.length}/{MAX_BAR_INTERVALS})
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {CHART_INTERVALS.map((i) => {
            const on = shown.includes(i);
            return (
              <DropdownMenuCheckboxItem
                key={i}
                checked={on}
                disabled={!on && full}
                // Mantém o menu aberto para marcar vários.
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(c) => {
                  const next = c ? [...shown, i] : shown.filter((x) => x !== i);
                  if (!next.length) return; // pelo menos um
                  onShownChange(CHART_INTERVALS.filter((x) => next.includes(x)));
                }}
              >
                <span className="w-9 font-medium">{INTERVAL_LABEL[i]}</span>
                <span className="text-muted-foreground">{INTERVAL_NAME[i]}</span>
              </DropdownMenuCheckboxItem>
            );
          })}
          <DropdownMenuSeparator />
          <p className="px-2 py-1 text-[11px] text-muted-foreground">Tirar da barra não desliga o tempo: todos continuam aqui. 1m = minuto, 1M = mês.</p>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
