// Copia os arquivos que o server.js do modo standalone precisa (igual ao Dockerfile).
import fs from "node:fs";

const copy = (from, to) => {
  if (fs.existsSync(from)) fs.cpSync(from, to, { recursive: true });
};
copy(".next/static", ".next/standalone/.next/static");
copy("public", ".next/standalone/public");
copy("drizzle", ".next/standalone/drizzle");
