/** Applies database migrations. Bundled so containers can run it without TypeScript tooling. */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder =
  process.env.MIGRATIONS_DIR ?? resolve(here, "..", "..", "..", "packages", "database", "drizzle");
const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(sql), { migrationsFolder: join(migrationsFolder) });
  console.info(`migrations applied from ${migrationsFolder}`);
} finally {
  await sql.end();
}
