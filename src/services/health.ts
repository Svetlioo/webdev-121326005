import { pingDb } from '../data/health';

export type Health = { status: 'ok' | 'error'; db: 'ok' | 'down' };

/** Whether the app can do its job: it answers, and the database answers within 3 seconds. */
export async function checkHealth(ping: () => Promise<void> = pingDb): Promise<Health> {
  try {
    await Promise.race([ping(), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))]);
    return { status: 'ok', db: 'ok' };
  } catch {
    return { status: 'error', db: 'down' };
  }
}
