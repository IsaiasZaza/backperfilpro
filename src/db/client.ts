import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { env } from "../config/env";

/**
 * Neon via WebSocket (nao usa a porta 5432 do Postgres "puro").
 * Isso evita o P1001 que o Prisma/pg costumam dar no Windows.
 */
neonConfig.webSocketConstructor = ws;

export const pool = new Pool({ connectionString: env.DATABASE_URL });

/** SELECT/INSERT/UPDATE... devolvendo as linhas tipadas. */
export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

/** Igual ao query, mas devolve so a primeira linha (ou null). */
export async function queryOne<T>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Roda varias queries na mesma transacao. */
export async function withTransaction<T>(fn: (client: PoolClientLike) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

type PoolClientLike = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>;
};

export async function closeDb() {
  await pool.end();
}

/** Postgres: unique_violation */
export function isUniqueViolation(error: unknown) {
  return (error as { code?: string })?.code === "23505";
}
