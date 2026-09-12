import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDatabase>["db"];

export interface DatabaseOptions {
  /** Maximum pooled connections. Keep small; the workload is few, cheap queries. */
  max?: number;
}

export function createDatabase(url: string, options: DatabaseOptions = {}) {
  const sql = postgres(url, {
    max: options.max ?? 10,
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: true,
    onnotice: () => {},
  });
  const db = drizzle(sql, { schema, casing: "snake_case" });
  return {
    db,
    sql,
    async ping(): Promise<boolean> {
      try {
        await sql`select 1`;
        return true;
      } catch {
        return false;
      }
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}
