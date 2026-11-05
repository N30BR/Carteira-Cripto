"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney, formatMoneyPrice, type RefCurrency } from "@/lib/currency";
import { formatPct, formatQty } from "@/lib/format";
import type { PeriodChanges, PortfolioRow } from "@/lib/portfolio/calc";
import { cn } from "@/lib/utils";
import { CHANGE_COLUMNS, ChangeColumnsMenu, useShownChanges, type ChangeKey } from "./change-columns-menu";
import { DOWN, UP } from "./palette";

export type HoldingsTableRow = PortfolioRow & PeriodChanges;

type Key =
  | "name"
  | "quantity"
  | "price"
  | "value"
  | "share"
  | "change24h"
  | "change7d"
  | "change1m"
  | "change6m"
  | "change1y";

const COLUMNS: { key: Key; label: string }[] = [
  { key: "name", label: "Ativo" },
  { key: "quantity", label: "Quantidade" },
  { key: "price", label: "Preço" },
  { key: "value", label: "Valor" },
  { key: "share", label: "%" },
  ...CHANGE_COLUMNS,
];

function sortValue(r: HoldingsTableRow, key: Key): string | number | null {
  if (key === "name") return r.name.toLowerCase();
  if (key === "quantity") return Number(r.quantity);
  return r[key];
}

/** Variação em % (ex.: 2.5 = 2,5%) com seta e cor; "—" quando não há dado. */
function Change({ value }: { value: number | null }) {
  if (value === null) return <>—</>;
  // Arredondado a 0,00%: sem seta e sem cor (evita "▼ 0,00%" em vermelho).
  if (Math.round(Math.abs(value) * 100) === 0) return <span className="text-muted-foreground">0,00%</span>;
  return (
    <span style={{ color: value >= 0 ? UP : DOWN }}>
      {value >= 0 ? "▲" : "▼"} {formatPct(Math.abs(value) / 100)}
    </span>
  );
}

export function HoldingsTable({ rows, currency }: { rows: HoldingsTableRow[]; currency: RefCurrency }) {
  const [chosenSort, setSort] = useState<{ key: Key; desc: boolean }>({ key: "value", desc: true });
  const [shown, setShown] = useShownChanges();
  const columns = COLUMNS.filter((c) => !c.key.startsWith("change") || shown.includes(c.key as ChangeKey));

  // Ordenado por uma variação que foi ocultada: volta a ordenar por valor.
  const sort = columns.some((c) => c.key === chosenSort.key) ? chosenSort : { key: "value" as Key, desc: true };

  const sorted = [...rows].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    if (va === null && vb === null) return 0;
    if (va === null) return 1; // vazios sempre no fim
    if (vb === null) return -1;
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sort.desc ? -cmp : cmp;
  });

  const toggle = (key: Key) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "name" }));

  // Todas as colunas centralizadas, menos "Ativo".
  const align = (key: Key) => (key === "name" ? "text-left" : "text-center");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <h2 className="font-medium">Ativos</h2>
        <ChangeColumnsMenu shown={shown} onChange={setShown} />
      </div>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={align(c.key)}
                  aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : "none"}
                >
                  <button type="button" onClick={() => toggle(c.key)} className="hover:text-foreground">
                    {c.label}
                    {sort.key === c.key && (sort.desc ? " ↓" : " ↑")}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-left">
                  <span className="font-medium uppercase">{r.symbol}</span>
                  {r.name !== r.symbol && <span className="ml-1 text-muted-foreground">{r.name}</span>}
                  {r.price === null && (
                    <Badge variant="outline" className="ml-2">
                      sem preço
                    </Badge>
                  )}
                </TableCell>
                <TableCell className={cn(align("quantity"), "tabular-nums")}>{formatQty(r.quantity)}</TableCell>
                <TableCell className={cn(align("price"), "tabular-nums")}>
                  {r.price === null ? "—" : formatMoneyPrice(r.price, currency)}
                </TableCell>
                <TableCell className={cn(align("value"), "tabular-nums")}>
                  {r.value === null ? "—" : formatMoney(r.value, currency)}
                </TableCell>
                <TableCell className={cn(align("share"), "tabular-nums")}>
                  {r.share === null ? "—" : formatPct(r.share)}
                </TableCell>
                {shown.map((k) => (
                  <TableCell key={k} className={cn(align(k), "tabular-nums")}>
                    <Change value={r[k]} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
