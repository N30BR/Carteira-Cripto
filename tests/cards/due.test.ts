import { describe, expect, test } from "vitest";
import { testDb } from "../helpers/db";
import { users } from "@/db/schema";
import { ensureDefaultAccounts, listCardAccounts, setCardClosingDay, setCardDueDay } from "@/lib/cards/accounts";
import { dueDate, editAmount, invoiceMonthFor, invoicesDueBetween } from "@/lib/cards/due";

describe("data de vencimento", () => {
  test("a fatura de cada mês vence no próprio mês, no dia do cartão", () => {
    expect(dueDate("2026-11", 18)).toBe("2026-11-18");
    expect(dueDate("2026-12", 5)).toBe("2026-12-05");
  });

  test("dia maior que o mês vira o último dia (31 em fevereiro = 28/29)", () => {
    expect(dueDate("2026-02", 31)).toBe("2026-02-28");
    expect(dueDate("2028-02", 30)).toBe("2028-02-29");
  });

  test("sem vencimento informado: dia 1 do mês da fatura", () => {
    expect(dueDate("2026-11", null)).toBe("2026-11-01");
  });

  test("fechamento: a partir do dia de fechamento a compra vai para a fatura do mês seguinte", () => {
    expect(invoiceMonthFor("2026-11-10", 11)).toBe("2026-11");
    expect(invoiceMonthFor("2026-11-11", 11)).toBe("2026-12");
    expect(invoiceMonthFor("2026-12-20", 11)).toBe("2027-01");
    expect(invoiceMonthFor("2026-11-30", null)).toBe("2026-11");
    // fechamento dia 31 em fevereiro: fecha no último dia
    expect(invoiceMonthFor("2026-02-28", 31)).toBe("2026-03");
    expect(invoiceMonthFor("2026-02-27", 31)).toBe("2026-02");
  });

  test("faturas que vencem entre duas datas (o que o Resumo usa)", () => {
    const rows = [
      { accountId: 1, invoiceMonth: "2026-11", amountCents: 1000 }, // vence 10/11
      { accountId: 2, invoiceMonth: "2026-11", amountCents: 2000 }, // vence 25/11
      { accountId: 1, invoiceMonth: "2026-12", amountCents: 4000 }, // vence 10/12
      { accountId: 9, invoiceMonth: "2026-11", amountCents: 8000 }, // conta sem vencimento: 01/11
    ];
    const days = { 1: 10, 2: 25 };
    expect(invoicesDueBetween(rows, days, "2026-11-01", "2026-11-30")).toBe(1000 + 2000 + 8000);
    expect(invoicesDueBetween(rows, days, "2026-11-01", "2026-11-07")).toBe(8000);
    expect(invoicesDueBetween(rows, days, "2026-12-01", "2026-12-31")).toBe(4000);
  });
});

describe("dia de vencimento por conta", () => {
  const setup = () => {
    const db = testDb();
    const mk = (u: string) => db.insert(users).values({ username: u, passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0].id;
    const a = mk("ana");
    const b = mk("bia");
    ensureDefaultAccounts(db, a);
    ensureDefaultAccounts(db, b);
    return { db, a, b };
  };

  test("define, limpa e valida 1–31; não mexe na conta de outra pessoa", () => {
    const { db, a, b } = setup();
    const [pf] = listCardAccounts(db, a);
    expect(listCardAccounts(db, a)[0].dueDay).toBeNull();
    expect(setCardDueDay(db, a, pf.id, 10)).toEqual({ ok: true });
    expect(listCardAccounts(db, a)[0].dueDay).toBe(10);
    for (const bad of [0, 32, 1.5, Number.NaN]) {
      expect(setCardDueDay(db, a, pf.id, bad)).toEqual({ ok: false, error: "O vencimento deve ser um dia de 1 a 31" });
    }
    expect(setCardDueDay(db, a, pf.id, null)).toEqual({ ok: true });
    expect(listCardAccounts(db, a)[0].dueDay).toBeNull();
    const theirs = listCardAccounts(db, b)[0];
    expect(setCardDueDay(db, a, theirs.id, 5)).toEqual({ ok: false, error: "Conta não encontrada" });
  });

  test("dia de fechamento: 1–31 ou vazio; só nas próprias contas", () => {
    const { db, a, b } = setup();
    const [pf] = listCardAccounts(db, a);
    expect(listCardAccounts(db, a)[0].closingDay).toBeNull();
    expect(setCardClosingDay(db, a, pf.id, 11)).toEqual({ ok: true });
    expect(listCardAccounts(db, a)[0].closingDay).toBe(11);
    expect(setCardClosingDay(db, a, pf.id, 0)).toEqual({ ok: false, error: "O fechamento deve ser um dia de 1 a 31" });
    expect(setCardClosingDay(db, a, pf.id, null)).toEqual({ ok: true });
    expect(setCardClosingDay(db, a, listCardAccounts(db, b)[0].id, 5)).toEqual({ ok: false, error: "Conta não encontrada" });
  });
});

describe("valor na edição de uma compra", () => {
  test("lançada como valor da parcela: a edição mostra a parcela", () => {
    expect(editAmount({ totalCents: 420000, installments: 12, amountMode: "parcela" })).toEqual({ mode: "parcela", amountCents: 35000 });
  });

  test("lançada como total: a edição mostra o total", () => {
    expect(editAmount({ totalCents: 100000, installments: 3, amountMode: "total" })).toEqual({ mode: "total", amountCents: 100000 });
  });

  test("compras antigas (sem o modo guardado): parcela se o total divide certinho, senão total", () => {
    expect(editAmount({ totalCents: 120000, installments: 3, amountMode: null })).toEqual({ mode: "parcela", amountCents: 40000 });
    expect(editAmount({ totalCents: 100000, installments: 3, amountMode: null })).toEqual({ mode: "total", amountCents: 100000 });
    expect(editAmount({ totalCents: 3490, installments: 1, amountMode: null })).toEqual({ mode: "parcela", amountCents: 3490 });
  });
});
