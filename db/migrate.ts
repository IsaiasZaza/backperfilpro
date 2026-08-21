import fs from "node:fs";
import path from "node:path";
import { closeDb, pool } from "../src/db/client";

/**
 * Aplica todos os arquivos .sql de db/migrations em ordem.
 * Uso: npm run db:migrate
 */
async function main() {
  const dir = path.resolve("db/migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("Nenhuma migration em db/migrations");
    return;
  }

  // tabela simples de controle (idempotente)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "_migrations" (
      "id" TEXT PRIMARY KEY,
      "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const file of files) {
    const already = await pool.query(`SELECT 1 FROM "_migrations" WHERE "id" = $1`, [file]);
    if (already.rowCount) {
      console.log(`skip  ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    console.log(`apply ${file}...`);
    await pool.query(sql);
    await pool.query(`INSERT INTO "_migrations" ("id") VALUES ($1)`, [file]);
    console.log(`ok    ${file}`);
  }

  console.log("Migrations concluidas.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => closeDb());
