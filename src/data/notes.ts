import { db } from './db';

export type Note = { id: number; entryId: number; week: number | null; text: string };

/** Every note on every class. */
export async function listNotes(): Promise<Note[]> {
  const { rows } = await db().query(
    'SELECT id::int AS id, entry_id::int AS "entryId", week, text FROM notes ORDER BY id',
  );
  return rows;
}

export async function insertNote(entryId: number, week: number | null, text: string, userId: string): Promise<Note> {
  const { rows } = await db().query(
    `INSERT INTO notes (entry_id, week, text, created_by) VALUES ($1, $2, $3, $4)
     RETURNING id::int AS id, entry_id::int AS "entryId", week, text`,
    [entryId, week, text, userId],
  );
  return rows[0];
}
