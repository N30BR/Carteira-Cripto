import Link from "next/link";
import { cn } from "@/lib/utils";

/** Botões de período como links; mantém os outros parâmetros da página (ex.: a moeda). */
export function PeriodSelector({
  options,
  current,
  path,
  query,
}: {
  options: readonly string[];
  current: string;
  path: string;
  query: Record<string, string>;
}) {
  return (
    <div className="inline-flex rounded-lg border p-0.5 text-sm" role="group" aria-label="Período do gráfico">
      {options.map((p) => (
        <Link
          key={p}
          href={`${path}?${new URLSearchParams({ ...query, periodo: p })}`}
          scroll={false}
          aria-current={p === current ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1 text-muted-foreground transition-colors hover:text-foreground",
            p === current && "bg-muted text-foreground",
          )}
        >
          {p}
        </Link>
      ))}
    </div>
  );
}
