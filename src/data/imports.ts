import { db } from './db';
import { insertEntries, type Parity } from './entries';

export type ImportStatus = 'queued' | 'processing' | 'ready' | 'failed' | 'published';

/** One class as the model read it, before it is checked and published. */
export type DraftClass = {
  course: string;
  type: string;
  day: number;
  startsAt: string;
  endsAt: string;
  room: string;
  startWeek: number;
  groups: { name: string; parity: Parity }[];
};

export type Import = {
  id: number;
  planId: number;
  status: ImportStatus;
  sourceUrl: string | null;
  hasImage: boolean;
  instructions: string;
  draft: DraftClass[] | null;
  error: string | null;
  createdAt: string;
};

/** A queued import as the worker needs it, with the photo. */
export type ImportJob = { id: number; planId: number; sourceUrl: string | null; image: Buffer | null; imageType: string | null; instructions: string };

const COLUMNS = `id::int AS id, plan_id::int AS "planId", status, source_url AS "sourceUrl", image IS NOT NULL AS "hasImage", instructions,
  draft, error, created_at AS "createdAt"`;

export type NewImport = { sourceUrl: string | null; image: Buffer | null; imageType: string | null; instructions: string };

export async function insertImport(planId: number, i: NewImport, userId: string): Promise<Import> {
  const { rows } = await db().query(
    `INSERT INTO imports (plan_id, source_url, image, image_type, instructions, created_by) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [planId, i.sourceUrl, i.image, i.imageType, i.instructions, userId],
  );
  return rows[0];
}

export async function listImports(planId: number): Promise<Import[]> {
  const { rows } = await db().query(`SELECT ${COLUMNS} FROM imports WHERE plan_id = $1 ORDER BY id DESC LIMIT 20`, [planId]);
  return rows;
}

export async function findImport(id: number): Promise<Import | null> {
  const { rows } = await db().query(`SELECT ${COLUMNS} FROM imports WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/** The photo an import was started with, or null. */
export async function findImportImage(id: number): Promise<{ data: Buffer; type: string } | null> {
  const { rows } = await db().query('SELECT image AS data, image_type AS type FROM imports WHERE id = $1 AND image IS NOT NULL', [id]);
  return rows[0] ?? null;
}

/**
 * Takes the oldest queued import and marks it processing, so two workers never take the same one.
 * waitSeconds: only an import that has waited at least that long (the backup worker lets the laptop go first).
 * One left in processing for 10 minutes (the worker died) is taken again.
 */
export async function claimNextImport(waitSeconds = 0): Promise<ImportJob | null> {
  const { rows } = await db().query(
    `UPDATE imports SET status = 'processing', updated_at = now()
      WHERE id = (SELECT id FROM imports
                   WHERE (status = 'queued' AND updated_at <= now() - make_interval(secs => $1))
                      OR (status = 'processing' AND updated_at < now() - interval '10 minutes')
                   ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id::int AS id, plan_id::int AS "planId", source_url AS "sourceUrl", image, image_type AS "imageType", instructions`,
    [waitSeconds],
  );
  return rows[0] ?? null;
}

/** Sets the status, and the draft or the error that goes with it. */
export async function updateImport(
  id: number,
  status: ImportStatus,
  fields: { draft?: DraftClass[]; error?: string | null } = {},
): Promise<void> {
  await db().query(
    `UPDATE imports SET status = $2, draft = COALESCE($3, draft), error = $4, updated_at = now() WHERE id = $1`,
    [id, status, fields.draft ? JSON.stringify(fields.draft) : null, fields.error ?? null],
  );
}

/**
 * Replaces the plan's classes with the draft and marks the import published, all or nothing.
 * Returns false, changing nothing, when the import is no longer ready (already published).
 */
export async function publishDraft(id: number, planId: number, draft: DraftClass[]): Promise<boolean> {
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const claimed = await client.query(
      `UPDATE imports SET status = 'published', updated_at = now() WHERE id = $1 AND status = 'ready'`,
      [id],
    );
    if (claimed.rowCount !== 1) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query('DELETE FROM entries WHERE plan_id = $1', [planId]);
    await insertEntries(planId, draft, client);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
