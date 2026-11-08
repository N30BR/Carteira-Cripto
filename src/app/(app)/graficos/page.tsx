import { getDb } from "@/db/client";
import { getModuleState, requireModule } from "@/lib/auth/modules";
import { listChartSymbols } from "@/lib/charts/market";
import { getChartPrefs, listChartTabs } from "@/lib/charts/store";
import { listHoldings } from "@/lib/holdings/holdings";
import {
  CROSS_PAIRS,
  crossPair,
  invertedPair,
  isMarketId,
} from "@/lib/market/ids";
import { getCoinRanks } from "@/lib/market/data";
import { ChartWorkspace } from "@/components/charts/workspace";

export const metadata = { title: "Gráficos · BlackHole Dashboard" };

export default async function ChartsPage({
  searchParams,
}: {
  searchParams: Promise<{ abrir?: string | string[] }>;
}) {
  const user = await requireModule("charts");
  const db = getDb();
  const tabs = listChartTabs(db, user.id);
  const prefs = getChartPrefs(db, user.id);
  const listedSymbols = await listChartSymbols(db);
  // Pares cruzados (XLM/BTC...): entram na lista da cotação deles, se a Binance não tiver o par de verdade.
  const real = new Set(listedSymbols.map((s) => s.symbol));
  const symbols = [
    ...listedSymbols,
    ...Object.entries(CROSS_PAIRS)
      .filter(([id]) => !real.has(id))
      .map(([id, p]) => ({ symbol: id, base: p.base, quote: p.quote })),
  ];
  // Capitalização (ordem do seletor de pares). Não segura a página: sem resposta em 3 s, segue sem ordem.
  const ranks = await Promise.race([
    getCoinRanks(db).catch(() => ({})),
    new Promise<Record<string, number>>((r) => setTimeout(() => r({}), 3000)),
  ]);
  // Ativos do Portfólio (para comparar sem cadastrar de novo): só os que têm par com USDT na Binance.
  const { on } = await getModuleState();
  const listed = new Set(symbols.map((s) => s.symbol));
  const portfolio = on("crypto")
    ? [
        ...new Set(listHoldings(db, user.id).map((h) => `${h.symbol}USDT`)),
      ].filter((s) => listed.has(s))
    : [];
  // "Abrir em Gráficos" (aba Cripto): só instrumentos conhecidos — par listado, par invertido ou série de mercado.
  const raw = (await searchParams).abrir;
  const abrir =
    typeof raw === "string" &&
    (isMarketId(raw) ||
      !!invertedPair(raw) ||
      !!crossPair(raw) ||
      listed.has(raw))
      ? raw
      : null;

  return (
    // Usa a largura toda da tela (o gráfico precisa de espaço).
    // Fundo próprio: o fundo espacial não aparece atrás das velas nem das barras do gráfico.
    <div className="relative left-1/2 -my-8 w-screen max-w-[100vw] -translate-x-1/2 bg-background px-3 py-8 md:px-6">
      <ChartWorkspace
        initialTabs={tabs}
        initialPrefs={prefs}
        symbols={symbols}
        ranks={ranks}
        portfolio={portfolio}
        openSymbol={abrir}
      />
    </div>
  );
}
