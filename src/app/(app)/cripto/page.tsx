import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { requireModule } from "@/lib/auth/modules";
import { getCryptoOverview } from "@/lib/market/data";
import { appTimeZone } from "@/lib/validation";
import { PERIOD_COOKIE, parsePeriod } from "@/lib/market/prefs";
import { CriptoView } from "./cripto-view";

export const metadata = { title: "Cripto · BlackHole Dashboard" };

/**
 * Cripto: análise do mercado (on-chain, ETFs de BTC e altseason). Diferente do Portfólio (carteira pessoal).
 * Só dados reais das fontes, com cache; cada parte que falhar mostra "Dados indisponíveis" sozinha.
 */
export default async function CriptoPage() {
  await requireModule("market");
  const saved = (await cookies()).get(PERIOD_COOKIE)?.value;
  const initialPeriod = parsePeriod(saved);
  const data = await getCryptoOverview(getDb());
  return (
    // Mais larga que as outras páginas (muitos painéis lado a lado), centralizada.
    <div className="relative left-1/2 w-[min(100vw-2rem,1440px)] -translate-x-1/2">
      <CriptoView data={data} timeZone={appTimeZone()} initialPeriod={initialPeriod} />
    </div>
  );
}
