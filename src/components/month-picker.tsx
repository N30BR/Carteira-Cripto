"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { addMonths, monthLabel } from "@/lib/cards/months";

/** Seletor de mês de referência (?mes=AAAA-MM), com setas para o mês anterior e o próximo. */
export function MonthPicker({ month }: { month: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(m: string) {
    if (!/^\d{4}-\d{2}$/.test(m)) return;
    const next = new URLSearchParams(params);
    next.set("mes", m);
    router.push(`${pathname}?${next}`, { scroll: false });
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2">
      <span className="hidden text-xs text-muted-foreground sm:inline">Mês de referência</span>
      <Button variant="ghost" size="icon-sm" aria-label="Mês anterior" onClick={() => go(addMonths(month, -1))}>
        ‹
      </Button>
      <label className="sr-only" htmlFor="month-picker">
        Mês de referência
      </label>
      <input
        id="month-picker"
        type="month"
        value={month}
        min="2000-01"
        max="2099-12"
        onChange={(e) => go(e.target.value)}
        className="rounded-md bg-transparent px-1 text-sm font-medium [color-scheme:dark]"
        aria-describedby="month-picker-label"
      />
      <span id="month-picker-label" className="sr-only">
        {monthLabel(month)}
      </span>
      <Button variant="ghost" size="icon-sm" aria-label="Próximo mês" onClick={() => go(addMonths(month, 1))}>
        ›
      </Button>
    </div>
  );
}
