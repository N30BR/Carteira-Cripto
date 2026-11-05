// Cópia consistente do banco (funciona com o app rodando).
// Uso no container: node scripts/backup.mjs
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const source = process.env.DATABASE_PATH ?? "data/app.db";
const dir = path.join(path.dirname(path.resolve(source)), "backups");
const day = new Date().toISOString().slice(0, 10);
const target = path.join(dir, `app-${day}.db`);

fs.mkdirSync(dir, { recursive: true });
const db = new Database(source, { readonly: true, fileMustExist: true });
await db.backup(target);
db.close();

// Rodando como root (console do Easypanel), devolve os arquivos ao usuário do app.
if (process.getuid?.() === 0) {
  for (const p of [dir, target]) fs.chownSync(p, 1000, 1000);
}
console.log(`Backup salvo em ${target}`);
