import { getDb } from "@/db/client";
import { getModuleState } from "@/lib/auth/modules";
import { listAccounts } from "@/lib/fiat/accounts";
import { listHoldings } from "@/lib/holdings/holdings";
import { appTimeZone, todayIn } from "@/lib/validation";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AddAssetDialog } from "./add-asset-dialog";
import { AddTransactionDialog } from "./add-transaction-dialog";
import { ModulesEmpty } from "@/components/modules-empty";
import { FiatSection } from "./fiat-section";
import { HoldingRow } from "./holding-row";

export const metadata = { title: "Ativos · BlackHole Dashboard" };

export default async function AssetsPage() {
  // Ativos fica sempre visível; cada seção segue o seu módulo (Cripto e R$).
  const { user, on } = await getModuleState();
  const db = getDb();
  const showCrypto = on("crypto");
  const showFiat = on("fiat");
  const holdings = showCrypto ? listHoldings(db, user.id) : [];
  const owned = Object.fromEntries(holdings.map((h) => [h.coinId, h.quantity]));
  const accounts = showFiat ? listAccounts(db, user.id) : [];
  const today = todayIn(appTimeZone());

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-2xl font-semibold">Meus ativos</h1>

      {!showCrypto && !showFiat && (
        <ModulesEmpty what="Os módulos Portfólio e R$ / Fiduciário" />
      )}

      {showCrypto && (
        <section className="flex flex-col gap-4" aria-labelledby="crypto-title">
          <div className="flex items-center justify-between">
            <h2 id="crypto-title" className="text-xl font-semibold">
              Cripto
            </h2>
            <div className="flex items-center gap-2">
              <AddTransactionDialog holdings={holdings} />
              <AddAssetDialog owned={owned} />
            </div>
          </div>
          {holdings.length === 0 ? (
            <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
              Nenhum ativo ainda. Clique em <strong>Adicionar fundos</strong>{" "}
              para começar.
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
      )}

      {showFiat && <FiatSection accounts={accounts} today={today} />}
    </div>
  );
}
