import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { requireModule } from "@/lib/auth/modules";
import { getPanorama } from "@/lib/macro/panorama";
import { MACRO_COOKIE, parseMacroPrefs } from "@/lib/macro/prefs";
import { MacroView } from "./macro-view";

export const metadata = { title: "Panorama Macro · BlackHole Dashboard" };

/** Panorama Macro: câmbio, juros, liquidez, indicadores, bolsas e ativos principais (fontes reais, com cache). */
export default async function MacroPage() {
  await requireModule("macro");
  const prefs = parseMacroPrefs((await cookies()).get(MACRO_COOKIE)?.value);
  const data = await getPanorama(getDb());
  return <MacroView data={data} initialPrefs={prefs} />;
}
