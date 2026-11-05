// Uso em desenvolvimento: npm run create-admin
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { getDb } from "../src/db/client";
import { createUser } from "../src/lib/admin/users";

async function main() {
  // O iterador guarda as linhas em buffer, então funciona tanto digitando quanto via pipe.
  const lines = createInterface({ input: stdin })[Symbol.asyncIterator]();
  const ask = async (q: string) => {
    stdout.write(q);
    const { value } = await lines.next();
    return (value ?? "").trim();
  };
  const username = await ask("Usuário: ");
  const password = await ask("Senha (mín. 8 caracteres): ");

  const result = await createUser(getDb(), { username, password, isAdmin: true });
  if (!result.ok) {
    console.error(`\nErro: ${result.error}`);
    process.exit(1);
  }
  console.log("\nAdministrador criado");
  process.exit(0);
}

main();
