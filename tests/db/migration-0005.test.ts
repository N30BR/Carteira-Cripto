// A migração 0005 cria as contas de cartão e liga as compras antigas a "Cartão PF" / "Cartão PJ".
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, expect, test } from "vitest";

const SRC = path.join(process.cwd(), "drizzle");
let tmp: string | null = null;
afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

/** Copia as migrações até `lastIdx` (inclusive) para uma pasta temporária. */
function migrationsUpTo(lastIdx: number): string {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mig-"));
  const journal = JSON.parse(fs.readFileSync(path.join(SRC, "meta", "_journal.json"), "utf8"));
  journal.entries = journal.entries.filter((e: { idx: number }) => e.idx <= lastIdx);
  fs.mkdirSync(path.join(tmp, "meta"));
  fs.writeFileSync(path.join(tmp, "meta", "_journal.json"), JSON.stringify(journal));
  for (const e of journal.entries) fs.copyFileSync(path.join(SRC, `${e.tag}.sql`), path.join(tmp, `${e.tag}.sql`));
  return tmp;
}

test("compras antigas ganham as contas Cartão PF/PJ do próprio dono; quem não tem compras fica sem contas", () => {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: migrationsUpTo(4) });

  const now = Date.now();
  const user = sqlite.prepare("INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, 'x', 0, ?)");
  const ana = Number(user.run("ana", now).lastInsertRowid);
  const bia = Number(user.run("bia", now).lastInsertRowid);
  user.run("caio", now); // sem compras
  const exp = sqlite.prepare(
    "INSERT INTO card_expenses (user_id, description, total_cents, installments, first_invoice, purchase_date, nature, card, created_at) VALUES (?, ?, 100, 1, '2026-01', '2026-01-05', ?, ?, ?)",
  );
  exp.run(ana, "a1", "PJ", "PF", now); // natureza diferente do cartão: preservada
  exp.run(ana, "a2", "PJ", "PJ", now);
  exp.run(bia, "b1", "PF", "PF", now);

  migrate(db, { migrationsFolder: SRC });

  const accounts = sqlite.prepare("SELECT id, user_id, name, kind FROM card_accounts ORDER BY id").all() as {
    id: number;
    user_id: number;
    name: string;
    kind: string;
  }[];
  expect(accounts.map((a) => [a.user_id, a.name, a.kind])).toEqual([
    [ana, "Cartão PF", "PF"],
    [bia, "Cartão PF", "PF"],
    [ana, "Cartão PJ", "PJ"],
    [bia, "Cartão PJ", "PJ"],
  ]);
  const rows = sqlite
    .prepare("SELECT e.description, e.nature, e.card, a.user_id AS owner, a.name FROM card_expenses e JOIN card_accounts a ON a.id = e.account_id ORDER BY e.id")
    .all();
  expect(rows).toEqual([
    { description: "a1", nature: "PJ", card: "PF", owner: ana, name: "Cartão PF" },
    { description: "a2", nature: "PJ", card: "PJ", owner: ana, name: "Cartão PJ" },
    { description: "b1", nature: "PF", card: "PF", owner: bia, name: "Cartão PF" },
  ]);
  expect(sqlite.prepare("SELECT count(*) AS n FROM card_expenses WHERE account_id IS NULL").get()).toEqual({ n: 0 });

  // Apagar um usuário continua funcionando (contas e compras saem juntas).
  sqlite.prepare("DELETE FROM users WHERE id = ?").run(ana);
  expect(sqlite.prepare("SELECT count(*) AS n FROM card_accounts WHERE user_id = ?").get(ana)).toEqual({ n: 0 });
});
