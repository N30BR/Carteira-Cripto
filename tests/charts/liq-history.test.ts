import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fetchBybitOpenInterest } from "@/lib/prices/bybit";
import { getHistoricalOpenInterest, resetHistoricalOpenInterestCache, resetOpenInterestCache } from "@/lib/charts/market";
import { resetBinanceState } from "@/lib/prices/binance";
import { liquidationHeatField, HEAT_BUCKETS, HEAT_BUCKETS_MAX } from "@/lib/charts/indicators";
import { defaultPane, defaultTab, movableAxes, sanitizeTabState, HIST_WIDTH_MAX, SIDE_WIDTH_MAX, SIDE_WIDTH_MIN } from "@/lib/charts/workspace";

const H = 3_600_000;
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const page = (list: [number, number][], cursor = "") => json({ retCode: 0, result: { list: list.map(([t, v]) => ({ timestamp: String(t), openInterest: String(v) })), nextPageCursor: cursor } });

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  resetHistoricalOpenInterestCache();
  resetOpenInterestCache();
  resetBinanceState();
});

describe("open interest histórico (Bybit)", () => {
  test("pagina do mais novo ao mais antigo, junta e devolve em ordem; ignora itens inválidos", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string) => {
        urls.push(u);
        return urls.length === 1
          ? page([[5 * H, 50], [4 * H, 40], [3 * H, 30]], "lastid%3D1%26lasttime%3D3")
          : json({ retCode: 0, result: { list: [{ timestamp: String(2 * H), openInterest: "20" }, { timestamp: "x", openInterest: "1" }, { timestamp: String(1 * H), openInterest: "-5" }], nextPageCursor: "" } });
      }),
    );
    expect(await fetchBybitOpenInterest("BTCUSDT", "1h", 1 * H, 6 * H)).toEqual([
      [2 * H, 20],
      [3 * H, 30],
      [4 * H, 40],
      [5 * H, 50],
    ]);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("category=linear");
    expect(urls[0]).toContain("intervalTime=1h");
    // Cursor enviado uma vez codificado (não "%253D").
    expect(urls[1]).toContain("cursor=lastid%3D1%26lasttime%3D3");
  });

  test("erro da Bybit (retCode ≠ 0) e par inválido são recusados", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ retCode: 10001, retMsg: "invalid" })));
    await expect(fetchBybitOpenInterest("BTCUSDT", "1h", 0, H)).rejects.toThrow();
    await expect(fetchBybitOpenInterest("BTC/USDT", "1h", 0, H)).rejects.toThrow("Par inválido");
  });

  test("sem a Bybit, usa o open interest da Binance (30 dias) e diz a fonte", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string) => (u.includes("bybit") ? new Response("bloqueado", { status: 403 }) : json([{ timestamp: 10 * H, sumOpenInterest: "123" }]))),
    );
    expect(await getHistoricalOpenInterest("BTCUSDT", "1h", 0, 20 * H)).toEqual({ source: "binance", points: [[10 * H, 123]] });
  });

  test("com a Bybit: fonte bybit e cache cobrindo a data pedida", async () => {
    const f = vi.fn(async () => page([[3 * H, 30], [2 * H, 20]]));
    vi.stubGlobal("fetch", f);
    const r = await getHistoricalOpenInterest("BTCUSDT", "1h", 2 * H, 4 * H);
    expect(r).toEqual({ source: "bybit", points: [[2 * H, 20], [3 * H, 30]] });
    await getHistoricalOpenInterest("BTCUSDT", "1h", 2 * H, 4 * H);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("mapa: faixas de preço conforme a amplitude", () => {
  const bars = (lo: number, hi: number) => [0, 1, 2].map((i) => ({ timestamp: i * H, open: lo, high: hi, low: lo, close: (lo + hi) / 2, volume: 1 }));
  const oi: [number, number][] = [[0, 100], [H, 110], [2 * H, 120]];
  test("faixa estreita: mínimo de 480; histórico longo (preços muito diferentes): mais faixas, até 2000", () => {
    expect(liquidationHeatField(bars(100, 101), oi).buckets).toBe(HEAT_BUCKETS);
    const wide = liquidationHeatField([...bars(3000, 3100), { timestamp: 3 * H, open: 120000, high: 125000, low: 118000, close: 121000, volume: 1 }], [...oi, [3 * H, 130]]);
    expect(wide.buckets).toBe(HEAT_BUCKETS_MAX);
  });
});

describe("largura do perfil lateral e do histograma da Faixa Fixa (estado salvo)", () => {
  const tab = (pane: Record<string, unknown>) => sanitizeTabState({ ...defaultTab(), panes: [{ ...defaultPane(), ...pane }] });
  test("perfil lateral: largura inteira dentro dos limites", () => {
    expect(tab({ sideWidth: 200 }).ok).toBe(true);
    expect(tab({ sideWidth: SIDE_WIDTH_MIN - 1 }).ok).toBe(false);
    expect(tab({ sideWidth: SIDE_WIDTH_MAX + 1 }).ok).toBe(false);
    expect(tab({ sideWidth: 150.5 }).ok).toBe(false);
  });
  test("Faixa Fixa: largura do histograma (%) por desenho, dentro dos limites", () => {
    const withProfile = (histWidth: unknown) =>
      tab({ overlays: [{ id: "a", name: "fixedRangeVolumeProfile", points: [{ timestamp: 1, value: 1 }, { timestamp: 2, value: 2 }], styles: { histWidth } }] });
    const ok = withProfile(150);
    expect(ok.ok && ok.value.panes[0].overlays[0].styles?.histWidth).toBe(150);
    expect(withProfile(HIST_WIDTH_MAX + 5).ok).toBe(false);
    expect(withProfile(1.5).ok).toBe(false);
  });
});

describe("cores do perfil lateral (estado salvo do gráfico)", () => {
  const tab = (sideColors: unknown) => sanitizeTabState({ ...defaultTab(), panes: [{ ...defaultPane(), sideColors }] });
  test("compras e vendas independentes, com opacidade; recusa cor inválida ou campo estranho", () => {
    const ok = tab({ buy: "#2962ffcc" });
    expect(ok.ok && ok.value.panes[0].sideColors).toEqual({ buy: "#2962ffcc" });
    const both = tab({ buy: "#2962ff", sell: "#ff9800" });
    expect(both.ok && both.value.panes[0].sideColors).toEqual({ buy: "#2962ff", sell: "#ff9800" });
    expect(tab({ buy: "red" }).ok).toBe(false);
    expect(tab({ buy: "#2962ff", other: "#000000" }).ok).toBe(false);
  });
});

describe("open interest histórico: pedidos simultâneos", () => {
  test("um pedido curto em andamento não responde no lugar de um mais longo", async () => {
    const starts: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string) => {
        const start = Number(new URL(u).searchParams.get("startTime"));
        starts.push(start);
        await new Promise((r) => setTimeout(r, 20));
        return page([[start + H, 1], [start, 1]]);
      }),
    );
    const now = 1000 * H;
    const [short, long] = await Promise.all([getHistoricalOpenInterest("BTCUSDT", "1h", 900 * H, now), getHistoricalOpenInterest("BTCUSDT", "1h", 500 * H, now)]);
    expect(short.points[0][0]).toBe(900 * H);
    expect(long.points[0][0]).toBe(500 * H);
    expect(starts).toEqual([900 * H, 500 * H]);
  });
});

describe("bloqueios por eixo dos desenhos (estado salvo)", () => {
  const withOverlay = (extra: Record<string, unknown>, name = "fibonacciLine") =>
    sanitizeTabState({ ...defaultTab(), panes: [{ ...defaultPane(), overlays: [{ id: "a", name, points: [{ timestamp: 1, value: 1 }, { timestamp: 2, value: 2 }], ...extra }] }] });
  test("cada desenho guarda os seus (sim/não); valor inválido é recusado", () => {
    const r = withOverlay({ lockX: true });
    expect(r.ok && r.value.panes[0].overlays[0]).toMatchObject({ lockX: true });
    expect(r.ok && r.value.panes[0].overlays[0].lockY).toBeUndefined();
    expect(withOverlay({ lockY: "sim" }).ok).toBe(false);
  });
  test("eixos por ferramenta: linha horizontal só Y, vertical só X, as demais os dois", () => {
    expect(movableAxes("horizontalStraightLine")).toEqual({ x: false, y: true });
    expect(movableAxes("verticalStraightLine")).toEqual({ x: true, y: false });
    expect(movableAxes("fixedRangeVolumeProfile")).toEqual({ x: true, y: true });
    expect(movableAxes("fibonacciLine")).toEqual({ x: true, y: true });
  });
});
