import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { requireModule } from "@/lib/auth/modules";
import { NEWS_COOKIE, parseNewsPrefs } from "@/lib/news/calendar";
import { getNewsData } from "@/lib/news/source";
import { appTimeZone } from "@/lib/validation";
import { NewsView } from "./news-view";

export const metadata = { title: "Notícias · BlackHole Dashboard" };

/** Calendário econômico: eventos de impacto médio e alto (★★ e ★★★) de EUA, Japão, Brasil e Zona do Euro. */
export default async function NewsPage() {
  await requireModule("news");
  const prefs = parseNewsPrefs((await cookies()).get(NEWS_COOKIE)?.value);
  const now = new Date();
  const data = await getNewsData(getDb(), now);
  // Só o que pode aparecer (de hoje até ~3 meses e meio): a lista fica pequena.
  const min = now.getTime() - 2 * 86_400_000;
  const max = now.getTime() + 100 * 86_400_000;
  return (
    <NewsView
      initialPrefs={prefs}
      events={data.events.filter((e) => e.ts >= min && e.ts <= max)}
      tz={appTimeZone()}
      now={now.getTime()}
      fetchedAt={data.fetchedAt}
      coveredUntil={data.coveredUntil}
      stale={data.stale}
      uncovered={data.uncovered}
    />
  );
}
