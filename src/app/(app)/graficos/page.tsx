import { getDb } from "@/db/client";
import { requireModule } from "@/lib/auth/modules";
import { listChartSymbols } from "@/lib/charts/market";
import { getChartPrefs, listChartTabs } from "@/lib/charts/store";
import { ChartWorkspace } from "@/components/charts/workspace";

export const metadata = { title: "Gráficos · BlackHole Dashboard" };

export default async function ChartsPage() {
  const user = await requireModule("charts");
  const db = getDb();
  const tabs = listChartTabs(db, user.id);
  const prefs = getChartPrefs(db, user.id);
  const symbols = await listChartSymbols(db);

  return (
    // Usa a largura toda da tela (o gráfico precisa de espaço).
    // Fundo próprio: o fundo espacial não aparece atrás das velas nem das barras do gráfico.
    <div className="relative left-1/2 -my-8 w-screen max-w-[100vw] -translate-x-1/2 bg-background px-3 py-8 md:px-6">
      <ChartWorkspace initialTabs={tabs} initialPrefs={prefs} symbols={symbols} />
    </div>
  );
}
