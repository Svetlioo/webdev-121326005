// Applies the migrations. Safe to rerun. There is no shared schedule to seed: the ФКСТ КСИ sample
// in db/seed/ is a template a student can start a plan from (src/data/templates.ts).
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closeDb, db } from '../src/data/db';

async function main() {
  const pool = db();
  // Each numbered file in db/migrations runs once, in order, and is remembered.
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)');
  const dir = join(import.meta.dirname, 'migrations');
  for (const name of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    const done = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
    if (done.rowCount) continue;
    // The file and its record commit together, so a crash never leaves one without the other.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(await readFile(join(dir, name), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    console.log(`applied ${name}`);
  }

  console.log('database ready');
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(closeDb);
