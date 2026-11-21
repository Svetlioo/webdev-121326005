import type { TimeWindow } from '../model/schemas';
import { db } from './db';

export type ModelStatus = 'idle' | 'queued' | 'processing' | 'failed';

export type Plan = {
  id: number;
  ownerId: string;
  ownerEmail: string;
  name: string;
  /** The student's own group, chosen after the timetable is in; null until then. */
  myGroup: string | null;
  /** For a subject ("course|type"): the group whose sessions the student attends, or null for "not taken". */
  subjects: Record<string, string | null>;
  windows: TimeWindow[];
  windowsFrom: 'parser' | 'model';
  modelStatus: ModelStatus;
  /** When the plan last changed or was queued: long in the queue means no worker is running. */
  updatedAt: string;
};

export type Source = { id: number; text: string | null; imageType: string | null };
export type Message = { id: number; role: 'user' | 'assistant'; content: string };
export type Share = { userId: string; email: string };

const PLAN = `p.id::int AS id, p.owner_id AS "ownerId", u.email AS "ownerEmail", p.name, p.my_group AS "myGroup", p.subjects,
  p.windows, p.windows_from AS "windowsFrom", p.model_status AS "modelStatus", p.updated_at AS "updatedAt"`;

export async function insertPlan(ownerId: string, name: string, myGroup: string | null): Promise<number> {
  const { rows } = await db().query('INSERT INTO plans (owner_id, name, my_group) VALUES ($1, $2, $3) RETURNING id::int AS id', [
    ownerId,
    name,
    myGroup,
  ]);
  return rows[0].id;
}

export async function setMyGroup(id: number, group: string): Promise<void> {
  await db().query('UPDATE plans SET my_group = $2 WHERE id = $1', [id, group]);
}

/** Replaces the subject choices. */
export async function setSubjects(id: number, subjects: Record<string, string | null>): Promise<void> {
  await db().query('UPDATE plans SET subjects = $2 WHERE id = $1', [id, JSON.stringify(subjects)]);
}

export async function findPlan(id: number): Promise<Plan | null> {
  const { rows } = await db().query(`SELECT ${PLAN} FROM plans p JOIN "user" u ON u.id = p.owner_id WHERE p.id = $1`, [id]);
  return rows[0] ?? null;
}

/** The user's own plans and the plans shared with them, newest first. */
export async function listPlansFor(userId: string): Promise<{ own: Plan[]; shared: Plan[] }> {
  const own = await db().query(`SELECT ${PLAN} FROM plans p JOIN "user" u ON u.id = p.owner_id WHERE p.owner_id = $1 ORDER BY p.id DESC`, [
    userId,
  ]);
  const shared = await db().query(
    `SELECT ${PLAN} FROM plans p JOIN "user" u ON u.id = p.owner_id JOIN plan_shares s ON s.plan_id = p.id
      WHERE s.user_id = $1 ORDER BY p.id DESC`,
    [userId],
  );
  return { own: own.rows, shared: shared.rows };
}

/** Every plan except the user's own, for an admin. */
export async function listOtherPlans(userId: string): Promise<Plan[]> {
  const { rows } = await db().query(`SELECT ${PLAN} FROM plans p JOIN "user" u ON u.id = p.owner_id WHERE p.owner_id <> $1 ORDER BY p.id DESC`, [
    userId,
  ]);
  return rows;
}

export async function isSharedWith(planId: number, userId: string): Promise<boolean> {
  const { rowCount } = await db().query('SELECT 1 FROM plan_shares WHERE plan_id = $1 AND user_id = $2', [planId, userId]);
  return rowCount === 1;
}

export async function deletePlan(id: number): Promise<void> {
  await db().query('DELETE FROM plans WHERE id = $1', [id]);
}

/** Saves the parser's busy windows and queues the plan for the model. */
export async function saveWindows(id: number, windows: TimeWindow[], from: 'parser' | 'model', modelStatus: ModelStatus): Promise<void> {
  await db().query(
    'UPDATE plans SET windows = $2, windows_from = $3, model_status = $4, updated_at = now() WHERE id = $1',
    [id, JSON.stringify(windows), from, modelStatus],
  );
}

export type ModelAnswer = { windows: TimeWindow[]; subjects?: Record<string, string | null>; instructions?: string[] };

/**
 * The worker's result, all or nothing: the model's busy times, and when the student asked for it the
 * new subject choices and the new list of instructions (replacing the text sources; photos stay).
 * Saved only while the plan is still 'processing': if the owner changed something meanwhile, the plan
 * is 'queued' again and this older answer is dropped. Returns whether it was saved.
 */
export async function applyModelAnswer(id: number, answer: ModelAnswer): Promise<boolean> {
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      `UPDATE plans SET windows = $2, windows_from = 'model', model_status = 'idle', subjects = COALESCE($3, subjects), updated_at = now()
        WHERE id = $1 AND model_status = 'processing'`,
      [id, JSON.stringify(answer.windows), answer.subjects ? JSON.stringify(answer.subjects) : null],
    );
    if (rowCount !== 1) {
      await client.query('ROLLBACK');
      return false;
    }
    if (answer.instructions) {
      await client.query('DELETE FROM plan_sources WHERE plan_id = $1 AND text IS NOT NULL', [id]);
      for (const text of answer.instructions) await client.query('INSERT INTO plan_sources (plan_id, text) VALUES ($1, $2)', [id, text]);
    }
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** The model failed or answered wrongly: the plan keeps what it had. Only while still 'processing'. */
export async function failPlan(id: number): Promise<void> {
  await db().query(`UPDATE plans SET model_status = 'failed', updated_at = now() WHERE id = $1 AND model_status = 'processing'`, [id]);
}

/** Takes the oldest plan waiting for the model; one stuck in processing for 10 minutes is taken again. */
export async function claimNextPlan(): Promise<number | null> {
  const { rows } = await db().query(
    `UPDATE plans SET model_status = 'processing', updated_at = now()
      WHERE id = (SELECT id FROM plans
                   WHERE model_status = 'queued' OR (model_status = 'processing' AND updated_at < now() - interval '10 minutes')
                   ORDER BY updated_at FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id::int AS id`,
  );
  return rows[0]?.id ?? null;
}

export async function listSources(planId: number): Promise<Source[]> {
  const { rows } = await db().query(
    'SELECT id::int AS id, text, image_type AS "imageType" FROM plan_sources WHERE plan_id = $1 ORDER BY id',
    [planId],
  );
  return rows;
}

/** The photos of a plan, for the model. */
export async function listSourceImages(planId: number): Promise<{ data: Buffer; type: string }[]> {
  const { rows } = await db().query(
    'SELECT image AS data, image_type AS type FROM plan_sources WHERE plan_id = $1 AND image IS NOT NULL ORDER BY id',
    [planId],
  );
  return rows;
}

export async function findSourceImage(planId: number, sourceId: number): Promise<{ data: Buffer; type: string } | null> {
  const { rows } = await db().query(
    'SELECT image AS data, image_type AS type FROM plan_sources WHERE plan_id = $1 AND id = $2 AND image IS NOT NULL',
    [planId, sourceId],
  );
  return rows[0] ?? null;
}

export async function insertSource(planId: number, source: { text: string } | { image: Buffer; imageType: string }): Promise<void> {
  if ('text' in source) await db().query('INSERT INTO plan_sources (plan_id, text) VALUES ($1, $2)', [planId, source.text]);
  else await db().query('INSERT INTO plan_sources (plan_id, image, image_type) VALUES ($1, $2, $3)', [planId, source.image, source.imageType]);
}

export async function deleteSource(planId: number, sourceId: number): Promise<boolean> {
  const { rowCount } = await db().query('DELETE FROM plan_sources WHERE plan_id = $1 AND id = $2', [planId, sourceId]);
  return rowCount === 1;
}

export async function listMessages(planId: number): Promise<Message[]> {
  const { rows } = await db().query('SELECT id::int AS id, role, content FROM plan_messages WHERE plan_id = $1 ORDER BY id', [planId]);
  return rows;
}

export async function insertMessage(planId: number, role: 'user' | 'assistant', content: string): Promise<void> {
  await db().query('INSERT INTO plan_messages (plan_id, role, content) VALUES ($1, $2, $3)', [planId, role, content]);
}

export async function listShares(planId: number): Promise<Share[]> {
  const { rows } = await db().query(
    'SELECT s.user_id AS "userId", u.email FROM plan_shares s JOIN "user" u ON u.id = s.user_id WHERE s.plan_id = $1 ORDER BY u.email',
    [planId],
  );
  return rows;
}

export async function addShare(planId: number, userId: string): Promise<void> {
  await db().query('INSERT INTO plan_shares (plan_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [planId, userId]);
}

export async function removeShare(planId: number, userId: string): Promise<void> {
  await db().query('DELETE FROM plan_shares WHERE plan_id = $1 AND user_id = $2', [planId, userId]);
}
