import type pg from 'pg';
import { db } from './db';

export type Parity = 'all' | 'odd' | 'even';

export type Entry = {
  id: number;
  course: string;
  type: 'lecture' | 'seminar' | 'lab';
  day: number;
  startsAt: string;
  endsAt: string;
  room: string;
  startWeek: number;
  groups: { name: string; parity: Parity }[];
};

/** A class before it has an id: from the sample timetable or from a published import. */
export type NewEntry = Omit<Entry, 'id' | 'type'> & { type: string };

/** Every class of one plan's timetable, with the groups that attend it. */
export async function listEntries(planId: number): Promise<Entry[]> {
  const { rows } = await db().query(
    `SELECT e.id::int AS id, e.course, e.type, e.day,
            to_char(e.starts_at, 'HH24:MI') AS "startsAt",
            to_char(e.ends_at, 'HH24:MI') AS "endsAt",
            e.room, e.start_week AS "startWeek",
            json_agg(json_build_object('name', g.group_name, 'parity', g.parity) ORDER BY g.group_name) AS groups
       FROM entries e
       JOIN entry_groups g ON g.entry_id = e.id
      WHERE e.plan_id = $1
      GROUP BY e.id`,
    [planId],
  );
  return rows;
}

/** The plan a class belongs to, or null when there is no such class. */
export async function findEntryPlan(id: number): Promise<number | null> {
  const { rows } = await db().query('SELECT plan_id::int AS "planId" FROM entries WHERE id = $1', [id]);
  return rows[0]?.planId ?? null;
}

/** Deletes one class and its group rows. Returns whether it existed. */
export async function deleteEntry(id: number): Promise<boolean> {
  const { rowCount } = await db().query('DELETE FROM entries WHERE id = $1', [id]);
  return rowCount === 1;
}

/** Writes classes into a plan's timetable, inside the caller's transaction when one is given. */
export async function insertEntries(planId: number, entries: NewEntry[], client: pg.Pool | pg.PoolClient = db()): Promise<void> {
  for (const c of entries) {
    const { rows } = await client.query(
      `INSERT INTO entries (plan_id, course, type, day, starts_at, ends_at, room, start_week)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [planId, c.course, c.type, c.day, c.startsAt, c.endsAt, c.room, c.startWeek],
    );
    for (const g of c.groups) {
      await client.query('INSERT INTO entry_groups (entry_id, group_name, parity) VALUES ($1, $2, $3)', [rows[0].id, g.name, g.parity]);
    }
  }
}
