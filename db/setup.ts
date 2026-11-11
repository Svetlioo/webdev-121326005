// Applies the migrations and, on an empty database, adds the ФКСТ КСИ master's winter 2026/27
// classes copied from the official HTML page. Timetable only, no student names. Safe to rerun.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closeDb, db } from '../src/data/db';

type SeedEntry = {
  course: string;
  type: string;
  day: number;
  startsAt: string;
  endsAt: string;
  room: string;
  startWeek: number;
  groups: [string, string][];
};

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

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM entries');
  if (rows[0].n > 0) return console.log(`database ready, ${rows[0].n} classes already there`);

  const seed = JSON.parse(await readFile(join(import.meta.dirname, 'seed', 'fkst-ksi-mag-2026-winter.json'), 'utf8'));
  for (const e of seed.entries as SeedEntry[]) {
    const r = await pool.query(
      `INSERT INTO entries (course, type, day, starts_at, ends_at, room, start_week)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [e.course, e.type, e.day, e.startsAt, e.endsAt, e.room, e.startWeek],
    );
    for (const [group, parity] of e.groups) {
      await pool.query('INSERT INTO entry_groups (entry_id, group_name, parity) VALUES ($1, $2, $3)', [
        r.rows[0].id,
        group,
        parity,
      ]);
    }
  }
  console.log(`database ready, seeded ${seed.entries.length} classes`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(closeDb);
