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

/** Every class with the groups that attend it. */
export async function listEntries(): Promise<Entry[]> {
  const { rows } = await db().query(
    `SELECT e.id::int AS id, e.course, e.type, e.day,
            to_char(e.starts_at, 'HH24:MI') AS "startsAt",
            to_char(e.ends_at, 'HH24:MI') AS "endsAt",
            e.room, e.start_week AS "startWeek",
            json_agg(json_build_object('name', g.group_name, 'parity', g.parity) ORDER BY g.group_name) AS groups
       FROM entries e
       JOIN entry_groups g ON g.entry_id = e.id
      GROUP BY e.id`,
  );
  return rows;
}

export async function entryExists(id: number): Promise<boolean> {
  const { rowCount } = await db().query('SELECT 1 FROM entries WHERE id = $1', [id]);
  return rowCount === 1;
}

/** Deletes one class and its group rows. Returns whether it existed. */
export async function deleteEntry(id: number): Promise<boolean> {
  const { rowCount } = await db().query('DELETE FROM entries WHERE id = $1', [id]);
  return rowCount === 1;
}
