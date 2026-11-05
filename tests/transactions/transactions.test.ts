import { describe, expect, test } from "vitest";
import { testDb } from "../helpers/db";
import { users } from "@/db/schema";
import {
  MAX_TRANSACTIONS,
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from "@/lib/transactions/store";
import { monthlyTransactions, transactionShares, transactionTotals } from "@/lib/transactions/calc";

function setup() {
  const db = testDb();
  const mk = (username: string) =>
    db.insert(users).values({ username, passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0].id;
  return { db, u: mk("ana"), other: mk("bia") };
}

const tx = (date: string, kind: "in" | "out", amountCents: number, description = "x") => ({ date, kind, description, amountCents });

describe("transações", () => {
  test("cria, lista do mês em ordem de data (mais recente primeiro), edita e exclui", () => {
    const { db, u } = setup();
    createTransaction(db, u, tx("2025-05-03", "in", 50000, "Transferência recebida"));
    createTransaction(db, u, tx("2025-05-10", "in", 250000, "Recebimento de serviço"));
    createTransaction(db, u, tx("2025-05-08", "out", 78000, "Pagamento de fornecedor"));
    createTransaction(db, u, tx("2025-06-01", "out", 1000));
    const may = listTransactions(db, u, "2025-05-01", "2025-05-31");
    expect(may.map((t) => t.date)).toEqual(["2025-05-10", "2025-05-08", "2025-05-03"]);
    const id = may[1].id;
    expect(updateTransaction(db, u, id, tx("2025-05-09", "in", 10000, "Corrigido"))).toEqual({ ok: true });
    expect(listTransactions(db, u, "2025-05-01", "2025-05-31")[1]).toMatchObject({ id, date: "2025-05-09", kind: "in", amountCents: 10000, description: "Corrigido" });
    expect(deleteTransaction(db, u, id)).toEqual({ ok: true });
    expect(listTransactions(db, u, "2025-05-01", "2025-05-31")).toHaveLength(2);
  });

  test("ninguém vê nem altera a transação de outra pessoa", () => {
    const { db, u, other } = setup();
    createTransaction(db, other, tx("2025-05-03", "in", 100));
    const hers = listTransactions(db, other, "2000-01-01", "2099-12-31")[0];
    const nf = { ok: false, error: "Transação não encontrada" };
    expect(listTransactions(db, u, "2000-01-01", "2099-12-31")).toEqual([]);
    expect(updateTransaction(db, u, hers.id, tx("2025-05-03", "out", 1))).toEqual(nf);
    expect(deleteTransaction(db, u, hers.id)).toEqual(nf);
    expect(listTransactions(db, other, "2000-01-01", "2099-12-31")[0].amountCents).toBe(100);
  });

  test("limite de transações por pessoa", () => {
    const { db, u } = setup();
    expect(MAX_TRANSACTIONS).toBe(5000);
    const rows = Array.from({ length: MAX_TRANSACTIONS }, () => tx("2025-01-01", "in", 1));
    for (const r of rows) createTransaction(db, u, r);
    expect(createTransaction(db, u, tx("2025-01-01", "in", 1))).toEqual({ ok: false, error: `Limite de ${MAX_TRANSACTIONS} transações atingido` });
  });
});

describe("cálculos das transações", () => {
  // Exemplo da referência: entradas 6.350,00, saídas 3.180,00, saldo 3.170,00.
  const list = [
    tx("2025-05-10", "in", 250000),
    tx("2025-05-08", "out", 78000),
    tx("2025-05-06", "in", 135000),
    tx("2025-05-05", "out", 135000),
    tx("2025-05-03", "in", 250000),
    tx("2025-05-01", "out", 105000),
  ];

  test("entradas, saídas (como valor positivo), saldo e contagens", () => {
    expect(transactionTotals(list)).toEqual({ inflow: 635000, outflow: 318000, balance: 317000, countIn: 3, countOut: 3 });
    expect(transactionTotals([])).toEqual({ inflow: 0, outflow: 0, balance: 0, countIn: 0, countOut: 0 });
  });

  test("saldo negativo quando as saídas passam as entradas", () => {
    expect(transactionTotals([tx("2025-05-01", "in", 100), tx("2025-05-02", "out", 350)]).balance).toBe(-250);
  });

  test("participação usa entradas + saídas como base (nunca o saldo) e não divide por zero", () => {
    const s = transactionShares(transactionTotals(list));
    expect(s.inflow).toBeCloseTo(635000 / 953000, 10);
    expect(s.outflow).toBeCloseTo(318000 / 953000, 10);
    expect(s.inflow! + s.outflow!).toBeCloseTo(1, 10);
    expect(transactionShares(transactionTotals([]))).toEqual({ inflow: null, outflow: null });
  });

  test("série mensal com meses sem movimento", () => {
    const series = monthlyTransactions([...list, tx("2025-03-15", "out", 999)], ["2025-03", "2025-04", "2025-05"]);
    expect(series).toEqual([
      { month: "2025-03", inflow: 0, outflow: 999 },
      { month: "2025-04", inflow: 0, outflow: 0 },
      { month: "2025-05", inflow: 635000, outflow: 318000 },
    ]);
  });
});

describe("período do mês", () => {
  test("primeiro e último dia, inclusive fevereiro bissexto", async () => {
    const { monthRange } = await import("@/lib/transactions/period");
    expect(monthRange("2025-05")).toEqual(["2025-05-01", "2025-05-31"]);
    expect(monthRange("2024-02")).toEqual(["2024-02-01", "2024-02-29"]);
    expect(monthRange("2025-02")).toEqual(["2025-02-01", "2025-02-28"]);
    expect(monthRange("2025-12")).toEqual(["2025-12-01", "2025-12-31"]);
  });
});
