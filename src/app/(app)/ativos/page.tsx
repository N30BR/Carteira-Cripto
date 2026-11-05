import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/current";
import { listHoldings } from "@/lib/holdings/holdings";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AddAssetDialog } from "./add-asset-dialog";
import { HoldingRow } from "./holding-row";

export const metadata = { title: "Ativos · Carteira Cripto" };

export default async function AssetsPage() {
  const user = await requireUser();
  const holdings = listHoldings(getDb(), user.id);
  const owned = Object.fromEntries(holdings.map((h) => [h.coinId, h.quantity]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Meus ativos</h1>
        <AddAssetDialog owned={owned} />
      </div>
      {holdings.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          Nenhum ativo ainda. Clique em <strong>Adicionar ativo</strong> para começar.
        </p>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdings.map((h) => (
                <HoldingRow key={h.id} h={h} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
