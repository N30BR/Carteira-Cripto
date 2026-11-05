import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/current";
import { listAccounts } from "@/lib/fiat/accounts";
import { listHoldings } from "@/lib/holdings/holdings";
import { appTimeZone, todayIn } from "@/lib/validation";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AddAssetDialog } from "./add-asset-dialog";
import { FiatSection } from "./fiat-section";
import { HoldingRow } from "./holding-row";

export const metadata = { title: "Ativos · Carteira Cripto" };

export default async function AssetsPage() {
  const user = await requireUser();
  const db = getDb();
  const holdings = listHoldings(db, user.id);
  const owned = Object.fromEntries(holdings.map((h) => [h.coinId, h.quantity]));
  const accounts = listAccounts(db, user.id);
  const today = todayIn(appTimeZone());

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-2xl font-semibold">Meus ativos</h1>

      <section className="flex flex-col gap-4" aria-labelledby="crypto-title">
        <div className="flex items-center justify-between">
          <h2 id="crypto-title" className="text-xl font-semibold">
            Cripto
          </h2>
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
      </section>

      <FiatSection accounts={accounts} today={today} />
    </div>
  );
}
