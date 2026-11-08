// Perfil de volume lateral (botão da barra dos Gráficos): o MESMO cálculo da ferramenta Perfil de Volume (Faixa Fixa) —
// volumeProfileBand com os parâmetros padrão dela — aplicado às velas visíveis e à faixa de preço visível.
import { volumeProfileBand, type Bar, type VolumeProfile } from "./indicators";

/** Parâmetros padrão da ferramenta Faixa Fixa (24 faixas, área de valor 70%). */
export const SIDE_ROWS = 24;
export const SIDE_VALUE_AREA = 0.7;

type Candle = Bar & { buyVolume?: number };
const key = (d: Candle[]) => `${d.length}:${d[0]?.timestamp}:${d[d.length - 1]?.timestamp}:${d[d.length - 1]?.close}`;

/** Calcula uma vez por velas + janela + faixa de preço (zoom e arraste sem mudança não recalculam). */
let memo: { key: string; vp: VolumeProfile } | null = null;
export function sideProfileFor(data: Candle[], from: number, to: number, lo: number, hi: number): VolumeProfile {
  const k = `${key(data)}|${from}|${to}|${lo}|${hi}`;
  if (!memo || memo.key !== k) memo = { key: k, vp: volumeProfileBand(data.map((b) => ({ ...b, volume: b.volume ?? 0 })), from, to, lo, hi, SIDE_ROWS, SIDE_VALUE_AREA) };
  return memo.vp;
}
