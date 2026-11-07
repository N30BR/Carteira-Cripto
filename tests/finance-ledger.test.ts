import { describe, expect, test } from "vitest";
import { testDb } from "./helpers/db";
import { accountMovements, cardInstallments, users } from "@/db/schema";
import { applyMovements } from "@/lib/fiat/ledger";
import { createAccount, createAccountNoBalance, deleteAccount, listAccounts, listBalances, setBalance } from "@/lib/fiat/accounts";
import { createTransaction, deleteTransaction, listTransactions, updateTransaction } from "@/lib/transactions/store";
import { ensureDefaultAccounts, listCardAccounts } from "@/lib/cards/accounts";
import {
  closeMonth,
  createExpense,
  deleteExpense,
  listInstallments,
  previewMonthClose,
  setInstallmentPaid,
  setInstallmentSettled,
  updateExpense,
  type ExpenseInput,
} from "@/lib/cards/store";

const T = (iso: string) => Date.parse(iso);

describe("saldo com movimentações (função pura)", () => {
  test("saldo informado é a referência; movimentações depois dele somam/subtraem", () => {
    const s = applyMovements(
      [{ date: "2026-11-01", amount: "1000.00", createdAt: T("2026-11-01T10:00:00Z") }],
      [
        { date: "2026-11-03", amountCents: 25000, createdAt: T("2026-11-03T10:00:00Z") },
        { date: "2026-11-05", amountCents: -10050, createdAt: T("2026-11-05T10:00:00Z") },
      ],
    );
    expect(s).toEqual([
      { date: "2026-11-01", amount: "1000.00" },
      { date: "2026-11-03", amount: "1250.00" },
      { date: "2026-11-05", amount: "1149.50" },
    ]);
  });
  test("saldo informado depois de uma movimentação já a inclui (não conta duas vezes)", () => {
    const s = applyMovements(
      [{ date: "2026-11-05", amount: "900.00", createdAt: T("2026-11-06T10:00:00Z") }],
      [{ date: "2026-11-05", amountCents: -10000, createdAt: T("2026-11-05T09:00:00Z") }],
    );
    expect(s.at(-1)).toEqual({ date: "2026-11-05", amount: "900.00" });
  });
  test("sem saldo informado começa em zero; sem movimentações, nada muda", () => {
    expect(applyMovements([], [{ date: "2026-11-05", amountCents: -500, createdAt: 1 }])).toEqual([{ date: "2026-11-05", amount: "-5.00" }]);
    expect(applyMovements([{ date: "2026-01-01", amount: "1.00", createdAt: 1 }], [])).toEqual([{ date: "2026-01-01", amount: "1.00" }]);
  });
});

function setup() {
  const db = testDb();
  const mk = (username: string) =>
    db.insert(users).values({ username, passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0].id;
  const u = mk("ana");
  const other = mk("bia");
  ensureDefaultAccounts(db, u);
  ensureDefaultAccounts(db, other);
  return { db, u, other };
}
const balanceOf = (db: ReturnType<typeof testDb>, u: number, name: string) => listAccounts(db, u).find((a) => a.name === name)?.amount;

describe("transações nas contas do R$", () => {
  test("entrada soma, saída subtrai; editar atualiza; excluir estorna", () => {
    const { db, u } = setup();
    createAccount(db, u, { name: "Banco", amount: "1000.00", date: "2026-11-01" });
    const acc = listAccounts(db, u)[0].id;
    expect(createTransaction(db, u, { date: "2026-11-02", kind: "in", description: "Salário", amountCents: 50000, accountId: acc })).toEqual({ ok: true });
    expect(createTransaction(db, u, { date: "2026-11-03", kind: "out", description: "Mercado", amountCents: 20000, accountId: acc })).toEqual({ ok: true });
    expect(balanceOf(db, u, "Banco")).toBe("1300.00");
    const [mercado] = listTransactions(db, u, "2026-11-03", "2026-11-03");
    expect(mercado.accountName).toBe("Banco");
    updateTransaction(db, u, mercado.id, { date: "2026-11-03", kind: "out", description: "Mercado", amountCents: 30000, accountId: acc });
    expect(balanceOf(db, u, "Banco")).toBe("1200.00");
    deleteTransaction(db, u, mercado.id);
    expect(balanceOf(db, u, "Banco")).toBe("1500.00");
    // salvar de novo a mesma transação não duplica a movimentação
    const [sal] = listTransactions(db, u, "2026-11-02", "2026-11-02");
    updateTransaction(db, u, sal.id, { date: "2026-11-02", kind: "in", description: "Salário", amountCents: 50000, accountId: acc });
    updateTransaction(db, u, sal.id, { date: "2026-11-02", kind: "in", description: "Salário", amountCents: 50000, accountId: acc });
    expect(db.select().from(accountMovements).all()).toHaveLength(1);
    expect(balanceOf(db, u, "Banco")).toBe("1500.00");
  });
  test("conta de outra pessoa é recusada; conta nova sem saldo começa em zero", () => {
    const { db, u, other } = setup();
    const theirs = createAccountNoBalance(db, other, "Dela").id!;
    expect(createTransaction(db, u, { date: "2026-11-02", kind: "in", description: "x", amountCents: 100, accountId: theirs })).toEqual({ ok: false, error: "Conta inválida" });
    const mine = createAccountNoBalance(db, u, "Carteira").id!;
    createTransaction(db, u, { date: "2026-11-02", kind: "out", description: "Café", amountCents: 750, accountId: mine });
    expect(balanceOf(db, u, "Carteira")).toBe("-7.50");
    // nome repetido devolve a mesma conta (compartilhada)
    expect(createAccountNoBalance(db, u, "Carteira").id).toBe(mine);
  });
  test("informar um saldo novo reconcilia (movimentações anteriores ficam dentro dele)", () => {
    const { db, u } = setup();
    createAccount(db, u, { name: "Banco", amount: "100.00", date: "2026-11-01" });
    const acc = listAccounts(db, u)[0].id;
    createTransaction(db, u, { date: "2026-11-02", kind: "in", description: "x", amountCents: 5000, accountId: acc });
    setBalance(db, u, acc, { date: "2026-11-04", amount: "160.00" });
    expect(balanceOf(db, u, "Banco")).toBe("160.00");
    expect(listBalances(db, u)[acc].map((p) => p.amount)).toEqual(["100.00", "150.00", "160.00"]);
  });
  test("excluir a conta do R$ não apaga as transações (ficam sem conta)", () => {
    const { db, u } = setup();
    const acc = createAccountNoBalance(db, u, "Banco").id!;
    createTransaction(db, u, { date: "2026-11-02", kind: "in", description: "x", amountCents: 100, accountId: acc });
    expect(deleteAccount(db, u, acc)).toEqual({ ok: true });
    expect(listTransactions(db, u, "2026-11-01", "2026-11-30")[0]).toMatchObject({ accountId: null });
  });
});

describe("parcelas: Paga e Quitada", () => {
  const exp = (accountId: number, o: Partial<ExpenseInput> = {}): ExpenseInput => ({
    description: "Cadeira",
    totalCents: 40000,
    installments: 4,
    firstInvoice: "2026-11",
    purchaseDate: "2026-11-01",
    accountId,
    categoryId: null,
    notes: "",
    paidNumbers: [],
    ...o,
  });
  test("paga desconta só a parcela, da conta da fatura (mesmo nome no R$); desmarcar estorna", () => {
    const { db, u } = setup();
    const card = listCardAccounts(db, u)[0];
    createAccount(db, u, { name: card.name, amount: "1000.00", date: "2026-10-01" });
    createExpense(db, u, exp(card.id), "2026-11-01");
    const [p1] = listInstallments(db, u, "2026-11", "2026-11");
    setInstallmentPaid(db, u, p1.installmentId, true, "2026-11-10");
    expect(balanceOf(db, u, card.name)).toBe("900.00");
    // marcar de novo não desconta outra vez
    setInstallmentPaid(db, u, p1.installmentId, true, "2026-11-10");
    expect(balanceOf(db, u, card.name)).toBe("900.00");
    setInstallmentPaid(db, u, p1.installmentId, false, "2026-11-11");
    expect(balanceOf(db, u, card.name)).toBe("1000.00");
  });
  test("quitada não mexe no saldo e tira a paga (estornando); são exclusivas", () => {
    const { db, u } = setup();
    const card = listCardAccounts(db, u)[0];
    createAccount(db, u, { name: card.name, amount: "1000.00", date: "2026-10-01" });
    createExpense(db, u, exp(card.id), "2026-11-01");
    const [p1] = listInstallments(db, u, "2026-11", "2026-11");
    setInstallmentPaid(db, u, p1.installmentId, true, "2026-11-10");
    setInstallmentSettled(db, u, p1.installmentId, true);
    const [after] = listInstallments(db, u, "2026-11", "2026-11");
    expect(after).toMatchObject({ paid: false, settled: true });
    expect(balanceOf(db, u, card.name)).toBe("1000.00");
    setInstallmentPaid(db, u, p1.installmentId, true, "2026-11-12");
    expect(listInstallments(db, u, "2026-11", "2026-11")[0]).toMatchObject({ paid: true, settled: false });
    expect(balanceOf(db, u, card.name)).toBe("900.00");
  });
  test("cartão sem conta no R$ com o mesmo nome: a conta é criada (compartilhada) e ligada", () => {
    const { db, u } = setup();
    const card = listCardAccounts(db, u)[0];
    createExpense(db, u, exp(card.id), "2026-11-01");
    setInstallmentPaid(db, u, listInstallments(db, u, "2026-11", "2026-11")[0].installmentId, true, "2026-11-10");
    expect(balanceOf(db, u, card.name)).toBe("-100.00");
  });
  test("editar a compra mantém pagas/quitadas e não gera desconto retroativo de parcela paga antiga", () => {
    const { db, u } = setup();
    const card = listCardAccounts(db, u)[0];
    createAccount(db, u, { name: card.name, amount: "1000.00", date: "2026-10-01" });
    createExpense(db, u, exp(card.id), "2026-11-01");
    const rows = listInstallments(db, u, "2026-11", "2027-02");
    // parcela 2 "paga antes desta regra" (sem movimentação)
    db.update(cardInstallments).set({ paid: true }).where((byId(rows[1].installmentId))).run();
    setInstallmentPaid(db, u, rows[0].installmentId, true, "2026-11-10");
    updateExpense(db, u, rows[0].expenseId, exp(card.id, { description: "Cadeira nova" }), "2026-11-20");
    const after = listInstallments(db, u, "2026-11", "2027-02");
    expect(after.map((r) => r.paid)).toEqual([true, true, false, false]);
    expect(balanceOf(db, u, card.name)).toBe("900.00"); // só a parcela 1 descontou
    // excluir a compra estorna os descontos dela
    deleteExpense(db, u, rows[0].expenseId);
    expect(balanceOf(db, u, card.name)).toBe("1000.00");
  });
  test("fechamento mensal: paga só as em aberto do mês (sem duplicar); quitar não mexe em saldo", () => {
    const { db, u } = setup();
    const [c1, c2] = listCardAccounts(db, u);
    createAccount(db, u, { name: c1.name, amount: "1000.00", date: "2026-10-01" });
    createExpense(db, u, exp(c1.id), "2026-11-01");
    createExpense(db, u, exp(c2.id, { description: "Mesa", totalCents: 20000, installments: 2 }), "2026-11-01");
    const nov = listInstallments(db, u, "2026-11", "2026-11");
    setInstallmentPaid(db, u, nov[0].installmentId, true, "2026-11-05"); // já paga: não entra
    const pv = previewMonthClose(db, u, "2026-11");
    expect(pv).toMatchObject({ count: 1, totalCents: 10000 });
    expect(closeMonth(db, u, "2026-11", "paid", "2026-11-30")).toMatchObject({ ok: true, count: 1 });
    expect(closeMonth(db, u, "2026-11", "paid", "2026-11-30")).toMatchObject({ ok: true, count: 0 });
    expect(balanceOf(db, u, c1.name)).toBe("900.00");
    expect(balanceOf(db, u, c2.name)).toBe("-100.00");
    // dezembro quitado: nenhuma movimentação nova
    const before = db.select().from(accountMovements).all().length;
    closeMonth(db, u, "2026-12", "settled", "2026-12-30");
    expect(db.select().from(accountMovements).all()).toHaveLength(before);
    expect(listInstallments(db, u, "2026-12", "2026-12").every((r) => r.settled && !r.paid)).toBe(true);
    // outros meses intactos
    expect(listInstallments(db, u, "2027-01", "2027-01").every((r) => !r.paid && !r.settled)).toBe(true);
  });
});

// Filtro por id (drizzle) sem importar o operador no topo do arquivo de teste.
import { eq } from "drizzle-orm";
function byId(id: number) {
  return eq(cardInstallments.id, id);
}
