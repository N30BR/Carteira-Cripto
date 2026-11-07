"use client";

// Configurações de uma comparação (par, macro ou on-chain): mesmos componentes das configurações de indicadores.
// As mudanças valem na hora (e são salvas); "Cancelar" volta ao que era ao abrir.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { COMPARE_SCALE_LABEL, compareDisplay, compareScale } from "@/lib/charts/compare";
import { COMPARE_COLORS } from "@/lib/charts/colors";
import { MACRO_SERIES } from "@/lib/charts/macro-ids";
import { ONCHAIN_SERIES } from "@/lib/charts/onchain-ids";
import { marketInfo } from "@/lib/market/ids";
import { COMPARE_SCALES, type CompareScale, type CompareState } from "@/lib/charts/workspace";
import { cn } from "@/lib/utils";
import { ColorPicker, StyleMenu, WidthMenu } from "./object-ui";

export function compareLabel(c: CompareState): string {
  if (c.kind === "macro") return MACRO_SERIES.find((m) => m.id === c.id)?.label ?? c.id;
  if (c.kind === "onchain") return ONCHAIN_SERIES.find((o) => o.id === c.id)?.short ?? c.id;
  if (c.kind === "market") return marketInfo(c.id)?.short ?? c.id;
  if (c.id === "BTCETH") return "BTC/ETH";
  if (c.id === "PAXGUSDT") return "Ouro (PAXG/USDT)";
  if (c.id === "XAUTUSDT") return "Ouro (XAUT/USDT)";
  return c.id;
}

type Tab = "inputs" | "style" | "scale" | "visibility";

export function CompareSettingsDialog({
  compare,
  index,
  symbol,
  onClose,
  onApply,
}: {
  compare: CompareState | null;
  index: number;
  symbol: string;
  onClose: () => void;
  onApply: (next: CompareState) => void;
}) {
  return (
    <Dialog open={!!compare} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        {compare && <CompareSettingsForm key={`${compare.kind}-${compare.id}`} compare={compare} index={index} symbol={symbol} onClose={onClose} onApply={onApply} />}
      </DialogContent>
    </Dialog>
  );
}

function CompareSettingsForm({
  compare,
  index,
  symbol,
  onClose,
  onApply,
}: {
  compare: CompareState;
  index: number;
  symbol: string;
  onClose: () => void;
  onApply: (next: CompareState) => void;
}) {
  const [original] = useState(compare);
  const [tab, setTab] = useState<Tab>("style");
  const c = compare;
  const set = (patch: Partial<CompareState>) => onApply({ ...c, ...patch } as CompareState);
  const display = compareDisplay(c);
  const scale = compareScale(c, symbol);
  const info = c.kind === "onchain" ? ONCHAIN_SERIES.find((o) => o.id === c.id) : undefined;
  const macro = c.kind === "macro" ? MACRO_SERIES.find((m) => m.id === c.id) : undefined;
  const tabs: { id: Tab; label: string }[] = [
    { id: "inputs", label: "Entradas" },
    { id: "style", label: "Estilo" },
    { id: "scale", label: "Escala" },
    { id: "visibility", label: "Visibilidade" },
  ];
  return (
    <>
      <DialogHeader>
        <DialogTitle>{compareLabel(c)}</DialogTitle>
      </DialogHeader>
      <div role="tablist" aria-label="Configurações da comparação" className="flex gap-4 border-b text-sm">
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
      <div className="flex min-h-40 flex-col gap-3 py-1 text-sm">
        {tab === "inputs" && (
          <>
            <Row label="Série">
              <span className="rounded border bg-muted/40 px-2 py-1 font-mono text-xs">
                {c.kind === "pair"
                  ? c.id === "BTCETH"
                    ? "Binance: ETHBTC invertido"
                    : `Binance: ${c.id}`
                  : c.kind === "macro"
                    ? `FRED: ${c.id}`
                    : c.kind === "market"
                      ? `Mercado: ${marketInfo(c.id)?.name ?? c.id}`
                      : `On-chain: ${info?.name ?? c.id}`}
              </span>
            </Row>
            {info && <p className="text-xs text-muted-foreground">{info.description}</p>}
            {info?.note && <p className="text-xs text-amber-400/80">{info.note}</p>}
            {macro && <p className="text-xs text-muted-foreground">Série do FRED (Federal Reserve), com o valor de cada data publicada.</p>}
            {c.kind === "pair" && <p className="text-xs text-muted-foreground">Fechamento de cada vela do par, no mesmo tempo do gráfico.</p>}
            {c.kind === "market" && (
              <p className="text-xs text-muted-foreground">
                {marketInfo(c.id)?.description} Valor diário (CoinMarketCap, Coin Metrics e DefiLlama), sem interpolar; o último ponto é o valor do momento.
              </p>
            )}
          </>
        )}
        {tab === "style" && (
          <Row label="Linha">
            <ColorPicker label={`Cor de ${compareLabel(c)}`} value={c.color ?? COMPARE_COLORS[index % COMPARE_COLORS.length]} onChange={(color) => set({ color })} />
            <WidthMenu value={c.size ?? 1.5} onChange={(size) => set({ size })} />
            <StyleMenu value={c.style ?? "solid"} onChange={(style) => set({ style })} />
          </Row>
        )}
        {tab === "scale" && (
          <>
            <Row label="Posição">
              <select
                aria-label="Posição no gráfico"
                value={display}
                onChange={(e) => set({ display: e.target.value as "main" | "sub" })}
                className="h-8 rounded-md border bg-background px-2 text-sm"
              >
                <option value="main">Sobre o preço (gráfico principal)</option>
                <option value="sub">Painel abaixo</option>
              </select>
            </Row>
            <Row label="Escala">
              <select
                aria-label="Escala sobre o preço"
                value={scale}
                disabled={display === "sub"}
                onChange={(e) => set({ scale: e.target.value as CompareScale })}
                className="h-8 max-w-64 rounded-md border bg-background px-2 text-sm disabled:opacity-50"
              >
                {COMPARE_SCALES.map((s) => (
                  <option key={s} value={s}>
                    {COMPARE_SCALE_LABEL[s]}
                  </option>
                ))}
              </select>
            </Row>
            <p className="text-xs text-muted-foreground">
              {display === "sub"
                ? "No painel abaixo, a série aparece com os valores reais e escala própria."
                : "Percentual: começa no mesmo ponto do preço e segue as próprias variações. Escala própria: o mínimo e o máximo da série ocupam a faixa do preço (serve para unidades diferentes e valores negativos ou zero). A legenda sempre mostra o valor real."}
            </p>
          </>
        )}
        {tab === "visibility" && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={c.visible !== false} onChange={(e) => set({ visible: e.target.checked })} /> Mostrar no gráfico
          </label>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button
          variant="outline"
          onClick={() => {
            onApply(original);
            onClose();
          }}
        >
          Cancelar
        </Button>
        <Button onClick={onClose}>Ok</Button>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}
