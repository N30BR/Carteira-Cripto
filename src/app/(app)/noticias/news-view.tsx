"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  NEWS_COOKIE,
  NEWS_PERIODS,
  PERIOD_LABEL,
  REGIONS,
  filterEvents,
  groupEvents,
  localDate,
  localTime,
  periodRange,
  type NewsEvent,
  type NewsPrefs,
  type RegionId,
  type Stars,
} from "@/lib/news/calendar";
import { safeAction } from "@/lib/safe-action";
import { cn } from "@/lib/utils";
import { refreshNewsAction } from "./actions";

const AUTO_REFRESH = 30 * 60_000;
function savePrefs(next: NewsPrefs) {
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${NEWS_COOKIE}=${encodeURIComponent(JSON.stringify({ ...next, v: 2 }))}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${secure}`;
}
const REGION = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

function Chip({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={cn("rounded-md border px-2.5 py-1 text-sm text-muted-foreground hover:text-foreground", on && "border-[#8b7cf6] bg-muted font-medium text-foreground")}
    >
      {children}
    </button>
  );
}

const StarsView = ({ n }: { n: Stars }) => (
  <span
    className={cn("inline-flex", n === 3 ? "text-amber-400" : n === 2 ? "text-amber-400/60" : "text-amber-400/40")}
    aria-label={n === 3 ? "Impacto alto (3 estrelas)" : n === 2 ? "Impacto médio (2 estrelas)" : "Impacto baixo (1 estrela)"}
  >
    {Array.from({ length: n }, (_, i) => (
      <Star key={i} className="size-3.5 fill-current" />
    ))}
  </span>
);

export function NewsView({
  initialPrefs,
  events,
  tz,
  now,
  fetchedAt,
  coveredUntil,
  stale,
  uncovered,
}: {
  initialPrefs: NewsPrefs;
  events: NewsEvent[];
  tz: string;
  now: number;
  fetchedAt: number | null;
  coveredUntil: number | null;
  stale: boolean;
  uncovered: RegionId[];
}) {
  const [prefs, setPrefs] = useState(initialPrefs);
  const [pending, start] = useTransition();
  const router = useRouter();

  // Guarda as últimas escolhas (mesmo mecanismo das outras abas: cookie).
  const update = (next: NewsPrefs) => {
    setPrefs(next);
    savePrefs(next);
  };
  // Atualização automática (o servidor só consulta a fonte a cada 30 min).
  useEffect(() => {
    const id = setInterval(() => router.refresh(), AUTO_REFRESH);
    return () => clearInterval(id);
  }, [router]);

  const range = useMemo(() => periodRange(prefs.period, tz, new Date(now), prefs.direction), [prefs.period, prefs.direction, tz, now]);
  const past = prefs.direction === "past";
  // Histórico: o que o app já guardou (a fonte gratuita publica só a semana atual).
  const oldest = events.length ? localDate(Math.min(...events.map((e) => e.ts)), tz) : null;
  const grouped = useMemo(() => groupEvents(filterEvents(events, prefs.regions, prefs.stars), prefs.period, tz, range), [events, prefs, tz, range]);
  const coveredDate = coveredUntil ? localDate(coveredUntil, tz) : null;
  const partial = !past && (!coveredDate || coveredDate < range.to);
  const allRegions = prefs.regions.length === REGIONS.length;
  const toggleRegion = (r: RegionId) => {
    const next = prefs.regions.includes(r) ? prefs.regions.filter((x) => x !== r) : [...prefs.regions, r];
    if (next.length) update({ ...prefs, regions: REGIONS.map((x) => x.id).filter((x) => next.includes(x)) });
  };
  const toggleStars = (s: Stars) => {
    const next = prefs.stars.includes(s) ? prefs.stars.filter((x) => x !== s) : [...prefs.stars, s];
    if (next.length) update({ ...prefs, stars: next });
  };
  const fmtDate = (d: string) => d.split("-").reverse().join("/");
  const showMonths = prefs.period === "1m";
  const total = grouped.months.reduce((n, m) => n + m.days.reduce((k, d) => k + d.events.length, 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Notícias</h1>
          <p className="text-sm text-muted-foreground">Calendário econômico: próximos eventos e histórico, por importância. Horários no fuso {tz}.</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await safeAction(() => refreshNewsAction());
              if (!r.ok) toast.error(r.error);
              router.refresh();
            })
          }
        >
          <RefreshCw className={cn(pending && "animate-spin")} /> Atualizar
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
            <span className="w-24 text-xs font-medium tracking-wide text-muted-foreground uppercase">Período</span>
            <Chip on={!past} onClick={() => update({ ...prefs, direction: "next" })} label="Próximos eventos">
              Próximos
            </Chip>
            <Chip on={past} onClick={() => update({ ...prefs, direction: "past" })} label="Eventos já ocorridos">
              Anteriores
            </Chip>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            {NEWS_PERIODS.map((p) => (
              <Chip key={p} on={prefs.period === p} onClick={() => update({ ...prefs, period: p })}>
                {PERIOD_LABEL[p]}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Regiões">
            <span className="w-24 text-xs font-medium tracking-wide text-muted-foreground uppercase">Regiões</span>
            <Chip on={allRegions} onClick={() => update({ ...prefs, regions: REGIONS.map((r) => r.id) })}>
              Todos
            </Chip>
            {REGIONS.map((r) => (
              <Chip key={r.id} on={prefs.regions.includes(r.id)} onClick={() => toggleRegion(r.id)} label={r.label}>
                <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: r.color }} />
                {r.label}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Importância">
            <span className="w-24 text-xs font-medium tracking-wide text-muted-foreground uppercase">Importância</span>
            <Chip on={prefs.stars.includes(1)} onClick={() => toggleStars(1)} label="Impacto baixo (1 estrela)">
              <StarsView n={1} /> <span className="ml-1">Baixo</span>
            </Chip>
            <Chip on={prefs.stars.includes(2)} onClick={() => toggleStars(2)} label="Impacto médio (2 estrelas)">
              <StarsView n={2} /> <span className="ml-1">Médio</span>
            </Chip>
            <Chip on={prefs.stars.includes(3)} onClick={() => toggleStars(3)} label="Impacto alto (3 estrelas)">
              <StarsView n={3} /> <span className="ml-1">Alto</span>
            </Chip>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-1 text-xs text-muted-foreground" role="status">
        {stale && <p className="text-amber-400">Não foi possível atualizar agora: mostrando os últimos dados válidos{fetchedAt ? ` (de ${localDate(fetchedAt, tz).split("-").reverse().join("/")} ${localTime(fetchedAt, tz)})` : ""}. Podem estar desatualizados.</p>}
        {partial && (
          <p>
            Os eventos futuros ainda não foram integralmente disponibilizados pela fonte de dados
            {coveredDate ? ` (publicados até ${fmtDate(coveredDate)})` : ""}. A fonte gratuita publica uma semana por vez; os próximos aparecem conforme forem publicados.
          </p>
        )}
        {uncovered.filter((r) => prefs.regions.includes(r)).map((r) => (
          <p key={r}>
            {REGION[r].label}: sem fonte gratuita com classificação de impacto disponível — eventos não exibidos (integração pendente; opções pagas: Trading Economics, Financial Modeling Prep, Finnhub).
          </p>
        ))}
        {past && (
          <p>
            Histórico guardado pelo dashboard{oldest ? ` desde ${fmtDate(oldest)}` : ""} (a fonte gratuita publica uma semana por vez; eventos anteriores a
            isso não estão disponíveis).
          </p>
        )}
        <p>
          Fonte: Forex Factory (impacto alto = ★★★, médio = ★★, baixo = ★). “Divulgado” = número publicado no dia do evento: para os principais
          indicadores dos EUA vem do FRED/ALFRED (Federal Reserve), exatamente como saiu naquela data (variações calculadas com os valores da mesma
          publicação). Demais eventos e regiões: a fonte gratuita não informa, então fica “—”. Previsão nunca é mostrada como resultado.
        </p>
      </div>

      <section aria-label="Calendário econômico" className="flex flex-col gap-4">
        {grouped.months.map((m) => (
          <div key={m.key} className="flex flex-col gap-3">
            {showMonths && <h2 className="border-b border-[#8b7cf6]/40 pb-1 text-sm font-semibold tracking-wider text-[#a888c0]">{m.label}</h2>}
            {!m.days.length && (
              <p className="text-xs text-muted-foreground">
                {coveredDate && `${m.key}-01` > coveredDate ? "A fonte ainda não publicou eventos deste mês." : "Nenhum evento disponível neste mês."}
              </p>
            )}
            {m.days.map((d) => (
              <Card key={d.date}>
                <CardContent className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">
                    {d.weekday} — {d.label}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="py-1 pr-3 font-medium">Data</th>
                          <th className="py-1 pr-3 font-medium">Hora</th>
                          <th className="py-1 pr-3 font-medium">País</th>
                          <th className="py-1 pr-3 font-medium">Moeda</th>
                          <th className="py-1 pr-3 font-medium">Impacto</th>
                          <th className="py-1 pr-3 font-medium">Evento</th>
                          <th className="py-1 pr-3 font-medium">Situação</th>
                          <th className="py-1 pr-3 text-right font-medium">Divulgado</th>
                          <th className="py-1 pr-3 text-right font-medium">Previsão</th>
                          <th className="py-1 text-right font-medium">Anterior</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.events.map((e) => (
                          <tr key={e.id} className="border-t border-border/50">
                            <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums">{fmtDate(d.date)}</td>
                            <td className="py-1.5 pr-3 tabular-nums">{localTime(e.ts, tz)}</td>
                            <td className="py-1.5 pr-3 whitespace-nowrap">
                              <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: REGION[e.region].color }} />
                              {REGION[e.region].short}
                            </td>
                            <td className="py-1.5 pr-3">{e.currency}</td>
                            <td className="py-1.5 pr-3">
                              <StarsView n={e.stars} />
                            </td>
                            <td className="py-1.5 pr-3">{e.title}</td>
                            <td className="py-1.5 pr-3 whitespace-nowrap">
                              {e.ts <= now ? (
                                <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">Divulgado</span>
                              ) : (
                                <span className="rounded border border-[#8b7cf6]/50 px-1.5 py-0.5 text-[11px] text-[#cdb8e6]">Previsto</span>
                              )}
                            </td>
                            <td className="py-1.5 pr-3 text-right tabular-nums" title={e.ts > now ? undefined : e.actual ? "Valor publicado no dia (FRED/ALFRED)" : "Valor divulgado não disponível na fonte gratuita para este evento"}>
                              {e.actual ?? "—"}
                            </td>
                            <td className="py-1.5 pr-3 text-right tabular-nums">{e.forecast ?? "—"}</td>
                            <td className="py-1.5 text-right tabular-nums">{e.previous ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ))}
        {!total && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum evento disponível para esses filtros no período.</p>}
      </section>
    </div>
  );
}
