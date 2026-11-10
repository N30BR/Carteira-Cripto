"use client";

// Configurações das camadas de volume e fluxo (botões da barra do gráfico; abre com o clique direito no botão):
// marcações POC/VAH/VAL, Delta Horizontal e Footprint. Só o visual e as opções de apresentação; salvas na conta.
import { useState } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DELTA_DEFAULTS, FOOTPRINT_DEFAULTS, MARK_DEFAULTS, type FootprintStyle, type LayerStyles, type MarkStyle } from "@/lib/charts/workspace";
import { cn } from "@/lib/utils";
import { ColorPicker, NumberInput, SETTINGS_BODY, SETTINGS_DIALOG, StyleMenu, WidthMenu } from "./object-ui";

export type LayerKind = "marks" | "delta" | "footprint";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

const TITLES: Record<LayerKind, string> = { marks: "Marcações do perfil (POC, VAH, VAL)", delta: "Delta Horizontal (delta por preço)", footprint: "Delta na barra de preço (Footprint)" };

export function LayerSettingsDialog({ kind, styles, onClose, onApply }: { kind: LayerKind | null; styles: LayerStyles | undefined; onClose: () => void; onApply: (next: LayerStyles) => void }) {
  return (
    <Dialog open={!!kind} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={SETTINGS_DIALOG}>{kind && <Form key={kind} kind={kind} styles={styles ?? {}} onClose={onClose} onApply={onApply} />}</DialogContent>
    </Dialog>
  );
}

function Form({ kind, styles, onClose, onApply }: { kind: LayerKind; styles: LayerStyles; onClose: () => void; onApply: (next: LayerStyles) => void }) {
  const [draft, setDraft] = useState<LayerStyles>(structuredClone(styles));
  const mark = (k: "poc" | "vah" | "val"): Required<MarkStyle> => ({ ...MARK_DEFAULTS[k], ...draft.marks?.[k] });
  const setMark = (k: "poc" | "vah" | "val", patch: Partial<MarkStyle>) => setDraft((d) => ({ ...d, marks: { ...d.marks, [k]: { ...d.marks?.[k], ...patch } } }));
  const delta = { ...DELTA_DEFAULTS, ...draft.delta };
  const setDelta = (patch: Partial<typeof delta>) => setDraft((d) => ({ ...d, delta: { ...d.delta, ...patch } }));
  const fp: Required<FootprintStyle> = { ...FOOTPRINT_DEFAULTS, ...draft.footprint };
  const setFp = (patch: Partial<FootprintStyle>) => setDraft((d) => ({ ...d, footprint: { ...d.footprint, ...patch } }));
  // Padrão de fábrica só desta camada.
  const restore = () => setDraft((d) => ({ ...d, [kind]: undefined }));
  return (
    <>
      <DialogHeader>
        <DialogTitle>{TITLES[kind]}</DialogTitle>
      </DialogHeader>
      <div className={cn("flex max-h-[60vh] flex-col gap-3 py-1 text-sm", SETTINGS_BODY)}>
        {kind === "marks" &&
          (["poc", "vah", "val"] as const).map((k) => {
            const m = mark(k);
            return (
              <Row key={k} label={k.toUpperCase()}>
                <ColorPicker label={`Cor da ${k.toUpperCase()}`} value={m.color} onChange={(color) => setMark(k, { color })} />
                <WidthMenu value={m.size} onChange={(size) => setMark(k, { size })} />
                <StyleMenu value={m.style} onChange={(style) => setMark(k, { style })} />
                <Check label="Etiqueta" checked={m.label} onChange={(label) => setMark(k, { label })} />
              </Row>
            );
          })}
        {kind === "marks" && <p className="text-xs text-muted-foreground">Mesmo cálculo do perfil lateral (velas e faixa de preço visíveis; área de valor de 70%). Funcionam com o histograma ligado ou desligado.</p>}

        {kind === "delta" && (
          <>
            <Row label="Cores (positivo / negativo)">
              <ColorPicker label="Cor do delta positivo" value={delta.pos} onChange={(pos) => setDelta({ pos })} />
              <ColorPicker label="Cor do delta negativo" value={delta.neg} onChange={(neg) => setDelta({ neg })} />
            </Row>
            <Row label="Largura do histograma">
              <input type="range" min={60} max={600} step={10} value={delta.width} aria-label="Largura do Delta Horizontal" onChange={(e) => setDelta({ width: Number(e.target.value) })} className="w-40" />
              <span className="text-xs text-muted-foreground">{delta.width}px</span>
            </Row>
            <p className="text-xs text-muted-foreground">
              Delta = compras − vendas agressoras por faixa de preço, nas velas visíveis. Fonte: velas menores reais da Binance (volume comprador agressor de cada uma), repartidas pela faixa de preço de cada vela menor.
            </p>
          </>
        )}

        {kind === "footprint" && (
          <>
            <Row label="Faixas de preço">
              <select aria-label="Modo das faixas" value={fp.rowMode} onChange={(e) => setFp({ rowMode: e.target.value as FootprintStyle["rowMode"] })} className="h-8 max-w-full rounded-md border bg-background px-2 text-sm">
                <option value="auto">Automático (vela média)</option>
                <option value="atr">Baseado em ATR</option>
                <option value="count">Quantidade por vela</option>
              </select>
              <NumberInput label="Quantidade de faixas" value={fp.levels} min={2} max={60} step={1} onChange={(levels) => setFp({ levels: Math.round(levels) })} />
              {fp.rowMode === "atr" && <NumberInput label="Período do ATR" value={fp.atrPeriod} min={2} max={200} step={1} onChange={(atrPeriod) => setFp({ atrPeriod: Math.round(atrPeriod) })} />}
            </Row>
            <Row label="Exibição">
              <select aria-label="Modo de exibição" value={fp.mode} onChange={(e) => setFp({ mode: e.target.value as FootprintStyle["mode"] })} className="h-8 max-w-full rounded-md border bg-background px-2 text-sm">
                <option value="bidask">Compra e venda</option>
                <option value="delta">Delta</option>
                <option value="volume">Volume total</option>
              </select>
              <Check label="Gradiente no fundo" checked={fp.gradient} onChange={(gradient) => setFp({ gradient })} />
            </Row>
            <Row label="Cores">
              <ColorPicker label="Fundo das compras" value={fp.buyColor} onChange={(buyColor) => setFp({ buyColor })} />
              <ColorPicker label="Fundo das vendas" value={fp.sellColor} onChange={(sellColor) => setFp({ sellColor })} />
              <ColorPicker label="Texto" value={fp.textColor} onChange={(textColor) => setFp({ textColor })} />
              <ColorPicker label="Destaque de imbalance" value={fp.imbColor} onChange={(imbColor) => setFp({ imbColor })} />
            </Row>
            <Row label="Value Area da vela">
              <Check label="Mostrar" checked={fp.showValueArea} onChange={(showValueArea) => setFp({ showValueArea })} />
              <NumberInput label="Value Area (%)" value={fp.valueAreaPct} min={10} max={100} step={1} onChange={(valueAreaPct) => setFp({ valueAreaPct })} />
            </Row>
            <Row label="POC da vela">
              <Check label="Mostrar POC" checked={fp.showPoc} onChange={(showPoc) => setFp({ showPoc })} />
            </Row>
            <Row label="Imbalance (diagonal)">
              <Check label="Destacar" checked={fp.showImbalance} onChange={(showImbalance) => setFp({ showImbalance })} />
              <NumberInput label="Imbalance (%)" value={fp.imbalancePct} min={100} max={2000} step={10} onChange={(imbalancePct) => setFp({ imbalancePct })} />
              <NumberInput label="Volume mínimo do imbalance" value={fp.imbalanceMin} min={0} max={1e12} step={1} onChange={(imbalanceMin) => setFp({ imbalanceMin })} />
              <NumberInput label="Níveis seguidos (empilhado)" value={fp.stackedMin} min={2} max={20} step={1} onChange={(stackedMin) => setFp({ stackedMin: Math.round(stackedMin) })} />
            </Row>
            <Row label="Valores">
              <Check label="Ocultar zeros" checked={fp.hideZeros} onChange={(hideZeros) => setFp({ hideZeros })} />
              <NumberInput label="Volume mínimo para mostrar" value={fp.minVolume} min={0} max={1e12} step={1} onChange={(minVolume) => setFp({ minVolume })} />
            </Row>
            <Row label="Resumo da vela">
              <Check label="Delta e volume total" checked={fp.summary} onChange={(summary) => setFp({ summary })} />
            </Row>
            <p className="text-xs text-muted-foreground">
              Aproximado: compras e vendas agressoras reais de velas menores da Binance (ex.: 1 min dentro de 1 h), cada uma repartida pela própria faixa de preço — não é a fita de negócios tick a tick. Imbalance diagonal:
              compras de um nível ≥ X% das vendas do nível de baixo (e vendas ≥ X% das compras do nível de cima). Os ajustes de valores mínimos e zeros só mudam o que aparece.
            </p>
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="ghost" className="mr-auto" title="Restaurar o visual de fábrica desta camada" onClick={restore}>
          <Undo2 /> Padrão
        </Button>
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
