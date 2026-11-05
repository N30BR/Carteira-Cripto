import Link from "next/link";
import type { Period } from "@/lib/portfolio/calc";
import { cn } from "@/lib/utils";

const OPTIONS: Period[] = ["7D", "30D", "1A"];

export function PeriodSelector({ current }: { current: Period }) {
  return (
    <div className="inline-flex rounded-lg border p-0.5 text-sm" role="group" aria-label="Período do gráfico">
      {OPTIONS.map((p) => (
        <Link
          key={p}
          href={`/?periodo=${p}`}
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
