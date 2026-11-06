import path from "node:path";
import { defineConfig } from "@playwright/test";

// Banco novo a cada execução; caminho absoluto porque o server.js standalone muda de diretório.
const dbPath = path.resolve("data", `e2e-${Date.now()}.db`);

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  use: { baseURL: "http://localhost:3100" },
  webServer: [
    {
      command: "npx tsx e2e/mock-binance.ts",
      url: "http://localhost:4010/api/v3/exchangeInfo",
      reuseExistingServer: false,
    },
    {
      command: "npm run build && npm run start:standalone",
      url: "http://localhost:3100/login",
      timeout: 300_000,
      reuseExistingServer: false,
      env: {
        PORT: "3100",
        DATABASE_PATH: dbPath,
        BINANCE_BASE_URL: "http://localhost:4010",
        BINANCE_FUTURES_BASE_URL: "http://localhost:4010",
        ADMIN_USERNAME: "admin",
        ADMIN_PASSWORD: "senha-forte-123",
        COOKIE_SECURE: "false",
      },
    },
  ],
});
