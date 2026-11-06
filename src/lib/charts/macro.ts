// Séries macro para comparar com os gráficos (juros, M2, liquidez), do FRED (banco central dos EUA).
// A chave (FRED_API_KEY) fica só no servidor; as séries ficam em cache por 6 horas.
import type { Db } from "@/db/client";
import { cached } from "@/lib/prices/cache";

import type { Point } from "./macro-math";
export type { Point } from "./macro-math";

import type { MacroId } from "./macro-ids";

export { MACRO_IDS, MACRO_SERIES, type MacroId } from "./macro-ids";

export { alignStep, combine, parseFredObservations, rebase, type Part } from "./macro-math";
import { combine, parseFredObservations } from "./macro-math";

// ---------- servidor ----------
const SIX_HOURS = 6 * 3_600_000;

export class MacroUnavailable extends Error {}

async function fredSeries(db: Db, seriesId: string, now: Date): Promise<Point[]> {
  const key = process.env.FRED_API_KEY;
  if (!key || !/^[a-z0-9]{32}$/i.test(key)) throw new MacroUnavailable("Chave do FRED não configurada");
  const r = await cached(
    db,
    `fred:${seriesId}`,
    SIX_HOURS,
    async () => {
      const url = `https://api.stlouisfed.org/fred/series/observations?${new URLSearchParams({
        series_id: seriesId,
        api_key: key,
        file_type: "json",
        observation_start: "2014-01-01",
      })}`;
      // A mensagem de erro nunca leva a URL (que contém a chave).
      let res: Response;
      try {
        res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      } catch {
        throw new Error("FRED indisponível");
      }
      if (!res.ok) throw new Error(`FRED ${res.status}`);
      return parseFredObservations(await res.json());
    },
    now,
  );
  if (!r) throw new MacroUnavailable("Dados do FRED indisponíveis no momento");
  return r.data;
}

/** Série pronta para o gráfico (em %, ou em trilhões de US$). */
export async function getMacroSeries(db: Db, id: MacroId, now = new Date()): Promise<Point[]> {
  const s = (sid: string) => fredSeries(db, sid, now);
  switch (id) {
    case "FED_FUNDS":
      return s("DFF");
    case "UST10Y":
      return s("DGS10");
    case "US_M2":
      return combine([{ points: await s("WM2NS"), scale: 1e-3 }]); // bilhões → trilhões
    case "FED_NET_LIQUIDITY": {
      const [walcl, tga, rrp] = await Promise.all([s("WALCL"), s("WTREGEN"), s("RRPONTSYD")]);
      // WALCL em milhões; TGA e reverse repo em bilhões.
      return combine([
        { points: walcl, scale: 1e-6 },
        { points: tga, scale: -1e-3 },
        { points: rrp, scale: -1e-3 },
      ]);
    }
    case "GLOBAL_LIQUIDITY": {
      const [walcl, ecb, boj, usdPerEur, jpyPerUsd] = await Promise.all([s("WALCL"), s("ECBASSETSW"), s("JPNASSETS"), s("DEXUSEU"), s("DEXJPUS")]);
      // Fed: milhões US$; BCE: milhões € × US$/€; BoJ: centenas de milhões de ¥ ÷ ¥/US$.
      return combine([
        { points: walcl, scale: 1e-6 },
        { points: ecb, scale: 1e-6, fx: usdPerEur, fxMode: "multiply" },
        { points: boj, scale: 1e-4, fx: jpyPerUsd, fxMode: "divide" },
      ]);
    }
  }
}
