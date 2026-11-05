import { and, asc, count, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cardCategories, cardExpenses } from "@/db/schema";

export const MAX_CATEGORIES = 50;
export const DEFAULT_CATEGORIES = [
  "Alimentação",
  "Assinaturas",
  "Serviços",
  "Equipamentos",
  "Manutenção",
  "Gasolina",
  "Saúde",
  "Transporte",
  "Educação e Cursos",
  "Software e Tecnologia",
  "Impostos e Taxas",
  "Compras Diversas",
  "Outros",
];

export type Result = { ok: true } | { ok: false; error: string };
export type Category = { id: number; name: string };

const NOT_FOUND: Result = { ok: false, error: "Categoria não encontrada" };
const DUPLICATE: Result = { ok: false, error: "Já existe uma categoria com esse nome" };

export function listCategories(db: Db, userId: number): Category[] {
  return db
    .select({ id: cardCategories.id, name: cardCategories.name })
    .from(cardCategories)
    .where(eq(cardCategories.userId, userId))
    .orderBy(asc(cardCategories.id))
    .all();
}

/** Na primeira visita (sem categorias e sem compras), cria as categorias padrão. */
export function ensureDefaultCategories(db: Db, userId: number): void {
  const [{ cats }] = db.select({ cats: count() }).from(cardCategories).where(eq(cardCategories.userId, userId)).all();
  if (cats > 0) return;
  const [{ exps }] = db.select({ exps: count() }).from(cardExpenses).where(eq(cardExpenses.userId, userId)).all();
  if (exps > 0) return;
  const now = new Date();
  db.insert(cardCategories)
    .values(DEFAULT_CATEGORIES.map((name) => ({ userId, name, createdAt: now })))
    .run();
}

export function ownsCategory(db: Db, userId: number, id: number): boolean {
  return !!db
    .select({ id: cardCategories.id })
    .from(cardCategories)
    .where(and(eq(cardCategories.id, id), eq(cardCategories.userId, userId)))
    .get();
}

function nameTaken(db: Db, userId: number, name: string, exceptId?: number): boolean {
  const row = db
    .select({ id: cardCategories.id })
    .from(cardCategories)
    .where(and(eq(cardCategories.userId, userId), eq(cardCategories.name, name)))
    .get();
  return !!row && row.id !== exceptId;
}

export function createCategory(db: Db, userId: number, name: string): Result {
  if (nameTaken(db, userId, name)) return DUPLICATE;
  const [{ n }] = db.select({ n: count() }).from(cardCategories).where(eq(cardCategories.userId, userId)).all();
  if (n >= MAX_CATEGORIES) return { ok: false, error: `Limite de ${MAX_CATEGORIES} categorias atingido` };
  db.insert(cardCategories).values({ userId, name, createdAt: new Date() }).run();
  return { ok: true };
}

export function renameCategory(db: Db, userId: number, id: number, name: string): Result {
  if (!ownsCategory(db, userId, id)) return NOT_FOUND;
  if (nameTaken(db, userId, name, id)) return DUPLICATE;
  db.update(cardCategories).set({ name }).where(eq(cardCategories.id, id)).run();
  return { ok: true };
}

/** Os lançamentos da categoria ficam "sem categoria" (a chave estrangeira usa SET NULL). */
export function deleteCategory(db: Db, userId: number, id: number): Result {
  if (!ownsCategory(db, userId, id)) return NOT_FOUND;
  db.delete(cardCategories).where(eq(cardCategories.id, id)).run();
  return { ok: true };
}
