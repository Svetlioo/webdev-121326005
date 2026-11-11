import type { Actor } from '../auth';
import { deleteEntry, listEntries, type Entry } from '../data/entries';
import { AppError } from './errors';

function requireActor(actor: Actor | null): Actor {
  if (!actor) throw new AppError(401, 'Влезте в профила си.');
  return actor;
}

/** The classes of the schedule, sorted by day and start time. Any signed-in user. */
export async function listClasses(actor: Actor | null): Promise<Entry[]> {
  requireActor(actor);
  const entries = await listEntries();
  return entries.sort((a, b) => a.day - b.day || a.startsAt.localeCompare(b.startsAt) || a.id - b.id);
}

/** Deletes a class. Publishers only: a student is refused, whatever the UI shows. */
export async function deleteClass(actor: Actor | null, id: number): Promise<void> {
  if (requireActor(actor).role !== 'publisher') {
    throw new AppError(403, 'Само публикуващ може да изтрива занятия.');
  }
  if (!Number.isInteger(id) || !(await deleteEntry(id))) throw new AppError(404, 'Занятието не е намерено.');
}
