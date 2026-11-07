import { describe, expect, test } from "vitest";
import { testDb } from "./helpers/db";
import { users } from "@/db/schema";
import { MODULES, firstActiveHref, moduleForPath, sanitizeDisabled } from "@/lib/modules";
import { getDisabledModules, setDisabledModules } from "@/lib/modules-store";

const mkUser = (db: ReturnType<typeof testDb>, u: string) =>
  db.insert(users).values({ username: u, passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0].id;

describe("módulos (configuração central)", () => {
  test("sete módulos podem ser desligados; Lançamentos e Ativos não estão na lista", () => {
    // "crypto" = aba Portfólio; "market" = aba Cripto (mercado), logo depois de Macro.
    expect(MODULES.map((m) => m.key)).toEqual(["crypto", "fiat", "invoices", "transactions", "summary", "charts", "news", "macro", "market", "todos"]);
    expect(MODULES.find((m) => m.key === "crypto")?.label).toBe("Portfólio");
    expect(MODULES.find((m) => m.key === "market")).toMatchObject({ label: "Cripto", href: "/cripto" });
    expect(MODULES.map((m) => m.href)).not.toContain("/lancamentos");
    expect(MODULES.map((m) => m.href)).not.toContain("/ativos");
  });

  test("lista salva é validada: só chaves conhecidas, sem repetição", () => {
    expect(sanitizeDisabled(["crypto", "crypto", "xyz", 3, "todos"])).toEqual(["crypto", "todos"]);
    expect(sanitizeDisabled("lixo")).toEqual([]);
    expect(sanitizeDisabled(null)).toEqual([]);
  });

  test("primeira aba ativa segue a ordem da barra; sem nenhuma, vai para Lançamentos", () => {
    expect(firstActiveHref([])).toBe("/");
    expect(firstActiveHref(["crypto"])).toBe("/fiduciario");
    expect(firstActiveHref(["crypto", "fiat", "invoices", "transactions", "summary", "charts", "news", "macro", "market", "todos"])).toBe("/lancamentos");
  });

  test("descobre o módulo pela rota (inclui subpáginas); rotas fixas não têm módulo", () => {
    expect(moduleForPath("/")).toBe("crypto");
    expect(moduleForPath("/fiduciario")).toBe("fiat");
    expect(moduleForPath("/graficos")).toBe("charts");
    expect(moduleForPath("/cripto")).toBe("market");
    expect(moduleForPath("/pendencias/x")).toBe("todos");
    expect(moduleForPath("/lancamentos")).toBeNull();
    expect(moduleForPath("/ativos")).toBeNull();
    expect(moduleForPath("/sobre")).toBeNull();
    expect(moduleForPath("/admin")).toBeNull();
  });
});

describe("preferências de módulos por usuário", () => {
  test("começa tudo ligado; salva e lê de novo; um usuário não afeta o outro", () => {
    const db = testDb();
    const a = mkUser(db, "a");
    const b = mkUser(db, "b");
    expect(getDisabledModules(db, a)).toEqual([]);
    setDisabledModules(db, a, ["crypto", "summary"]);
    expect(getDisabledModules(db, a)).toEqual(["crypto", "summary"]);
    expect(getDisabledModules(db, b)).toEqual([]);
    setDisabledModules(db, a, []);
    expect(getDisabledModules(db, a)).toEqual([]);
  });
});
