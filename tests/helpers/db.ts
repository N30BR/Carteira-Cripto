import { createDb, type Db } from "@/db/client";

export function testDb(): Db {
  return createDb(":memory:");
}
