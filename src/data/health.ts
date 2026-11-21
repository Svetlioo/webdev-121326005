import { db } from './db';

/** Asks the database one trivial question. Throws if it does not answer. */
export async function pingDb(): Promise<void> {
  await db().query('SELECT 1');
}
