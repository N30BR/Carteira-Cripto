import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { modulePrefs } from "@/db/schema";
import { sanitizeDisabled, type ModuleKey } from "./modules";

/** Módulos desligados pelo usuário (vazio = tudo ligado). */
export function getDisabledModules(db: Db, userId: number): ModuleKey[] {
  const row = db.select({ disabled: modulePrefs.disabled }).from(modulePrefs).where(eq(modulePrefs.userId, userId)).get();
  if (!row) return [];
  try {
    return sanitizeDisabled(JSON.parse(row.disabled));
  } catch {
    return [];
  }
}

export function setDisabledModules(db: Db, userId: number, raw: unknown): ModuleKey[] {
  const disabled = sanitizeDisabled(raw);
  const values = { userId, disabled: JSON.stringify(disabled), updatedAt: new Date() };
  db.insert(modulePrefs)
    .values(values)
    .onConflictDoUpdate({ target: modulePrefs.userId, set: { disabled: values.disabled, updatedAt: values.updatedAt } })
    .run();
  return disabled;
}
