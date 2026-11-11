// Creates the tables and, on an empty database, adds the ФКСТ КСИ master's winter 2026/27
// classes copied from the official HTML page. Timetable only, no student names. Safe to rerun.
import { readFile } from 'node:fs/promises';
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
  await pool.query(await readFile(join(import.meta.dirname, 'schema.sql'), 'utf8'));

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
