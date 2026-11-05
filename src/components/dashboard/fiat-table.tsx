import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney, type RefCurrency } from "@/lib/currency";
import type { FiatRow } from "@/lib/fiat/calc";
import { formatPct } from "@/lib/format";
import { DOWN, UP } from "./palette";

function formatDate(d: string): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

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

/** Contas do dashboard $ (já ordenadas pelo saldo). Colunas centralizadas, menos "Conta". */
export function FiatTable({ rows, currency }: { rows: FiatRow[]; currency: RefCurrency }) {
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Conta</TableHead>
            <TableHead className="text-center">Saldo</TableHead>
            <TableHead className="text-center">%</TableHead>
            <TableHead className="text-center">Atualizado em</TableHead>
            <TableHead className="text-center">1M</TableHead>
            <TableHead className="text-center">1A</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell className="text-center tabular-nums">{formatMoney(r.amount, currency)}</TableCell>
              <TableCell className="text-center tabular-nums">{r.share === null ? "—" : formatPct(r.share)}</TableCell>
              <TableCell className="text-center tabular-nums">{formatDate(r.date)}</TableCell>
              <TableCell className="text-center tabular-nums">
                <Change value={r.change1m} />
              </TableCell>
              <TableCell className="text-center tabular-nums">
                <Change value={r.change1y} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
