import { db } from './db';

export type Note = { id: number; entryId: number; week: number | null; text: string };

/** Every note on the classes of one plan. */
export async function listNotes(planId: number): Promise<Note[]> {
  const { rows } = await db().query(
    `SELECT n.id::int AS id, n.entry_id::int AS "entryId", n.week, n.text
       FROM notes n JOIN entries e ON e.id = n.entry_id
      WHERE e.plan_id = $1 ORDER BY n.id`,
    [planId],
  );
  return rows;
}

/** The class a note belongs to, or null. */
export async function findNoteEntry(id: number): Promise<number | null> {
  const { rows } = await db().query('SELECT entry_id::int AS "entryId" FROM notes WHERE id = $1', [id]);
  return rows[0]?.entryId ?? null;
}

export async function deleteNote(id: number): Promise<void> {
  await db().query('DELETE FROM notes WHERE id = $1', [id]);
}

export async function insertNote(entryId: number, week: number | null, text: string, userId: string): Promise<Note> {
  const { rows } = await db().query(
    `INSERT INTO notes (entry_id, week, text, created_by) VALUES ($1, $2, $3, $4)
     RETURNING id::int AS id, entry_id::int AS "entryId", week, text`,
    [entryId, week, text, userId],
  );
  return rows[0];
}
