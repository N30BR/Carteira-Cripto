"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPct, formatPrice, formatQty, formatUsd } from "@/lib/format";
import type { PortfolioRow } from "@/lib/portfolio/calc";
import { DOWN, UP } from "./palette";

type Key = "name" | "quantity" | "price" | "value" | "share" | "change24h";

const COLUMNS: { key: Key; label: string; right?: boolean }[] = [
  { key: "name", label: "Ativo" },
  { key: "quantity", label: "Quantidade", right: true },
  { key: "price", label: "Preço", right: true },
  { key: "value", label: "Valor US$", right: true },
  { key: "share", label: "%", right: true },
  { key: "change24h", label: "24h", right: true },
];

function sortValue(r: PortfolioRow, key: Key): string | number | null {
  if (key === "name") return r.name.toLowerCase();
  if (key === "quantity") return Number(r.quantity);
  return r[key];
}

export function HoldingsTable({ rows }: { rows: PortfolioRow[] }) {
  const [sort, setSort] = useState<{ key: Key; desc: boolean }>({ key: "value", desc: true });

  const sorted = [...rows].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    if (va === null) return 1; // vazios sempre no fim
    if (vb === null) return -1;
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sort.desc ? -cmp : cmp;
  });

  const toggle = (key: Key) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "name" }));

  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c) => (
              <TableHead
                key={c.key}
                className={c.right ? "text-right" : undefined}
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
              <TableCell>
                <span className="font-medium uppercase">{r.symbol}</span>
                {r.name !== r.symbol && <span className="ml-1 text-muted-foreground">{r.name}</span>}
                {r.price === null && (
                  <Badge variant="outline" className="ml-2">
                    sem preço
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatQty(r.quantity)}</TableCell>
              <TableCell className="text-right tabular-nums">{r.price === null ? "—" : formatPrice(r.price)}</TableCell>
              <TableCell className="text-right tabular-nums">{r.value === null ? "—" : formatUsd(r.value)}</TableCell>
              <TableCell className="text-right tabular-nums">{r.share === null ? "—" : formatPct(r.share)}</TableCell>
              <TableCell
                className="text-right tabular-nums"
                style={{ color: r.change24h === null ? undefined : r.change24h >= 0 ? UP : DOWN }}
              >
                {r.change24h === null ? "—" : `${r.change24h >= 0 ? "▲" : "▼"} ${formatPct(Math.abs(r.change24h) / 100)}`}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
