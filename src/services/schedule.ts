import type { Actor } from '../auth';
import { deleteEntry, entryExists, listEntries, type Entry } from '../data/entries';
import { insertNote, listNotes, type Note } from '../data/notes';
import { AppError, requireActor, requirePublisher } from './errors';

export const LAST_WEEK = 15;

export type WeekClass = Entry & { notes: Note[]; cancelled: boolean };

const byDayAndTime = (a: Entry, b: Entry) => a.day - b.day || a.startsAt.localeCompare(b.startsAt) || a.id - b.id;

function checkWeek(week: number): void {
  if (!Number.isInteger(week) || week < 1 || week > LAST_WEEK) {
    throw new AppError(400, `Седмицата трябва да е число от 1 до ${LAST_WEEK}.`);
  }
}

/** Does this group have this class in this week? Start week first, then odd/even weeks. */
function attends(entry: Entry, group: string, week: number): boolean {
  const g = entry.groups.find((x) => x.name === group);
  if (!g || week < entry.startWeek) return false;
  return g.parity === 'all' || (g.parity === 'odd') === (week % 2 === 1);
}

/** A note "Отменено" (for that week, or for every week) cancels the class. */
const isCancelling = (note: Note) => /^отменено/i.test(note.text.trim());

/** The classes of the schedule, sorted by day and start time. Any signed-in user. */
export async function listClasses(actor: Actor | null): Promise<Entry[]> {
  requireActor(actor);
  return (await listEntries()).sort(byDayAndTime);
}

/** What one group has in one week, with the notes for that week. Any signed-in user. */
export async function getWeek(actor: Actor | null, group: string, week: number): Promise<WeekClass[]> {
  requireActor(actor);
  checkWeek(week);
  const entries = await listEntries();
  if (!entries.some((e) => e.groups.some((g) => g.name === group))) {
    throw new AppError(404, 'Няма такава група в разписанието.');
  }
  const notes = await listNotes();
  return entries
    .filter((e) => attends(e, group, week))
    .sort(byDayAndTime)
    .map((e) => {
      const own = notes.filter((n) => n.entryId === e.id && (n.week === null || n.week === week));
      return { ...e, notes: own, cancelled: own.some(isCancelling) };
    });
}

/** Classes whose course or room contains the text, or that a group with exactly that name attends. */
export async function searchClasses(actor: Actor | null, query: string): Promise<Entry[]> {
  requireActor(actor);
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return (await listEntries())
    .filter(
      (e) =>
        e.course.toLowerCase().includes(q) ||
        e.room.toLowerCase().includes(q) ||
        e.groups.some((g) => g.name.toLowerCase() === q),
    )
    .sort(byDayAndTime);
}

export type FreeRoomsQuery = { day: number; from: string; to: string; week: number };

/** Rooms used somewhere in the schedule that no class takes on that day, time and week. */
export async function findFreeRooms(actor: Actor | null, { day, from, to, week }: FreeRoomsQuery): Promise<string[]> {
  requireActor(actor);
  checkWeek(week);
  if (!Number.isInteger(day) || day < 1 || day > 6) throw new AppError(400, 'Денят трябва да е от понеделник до събота.');
  const time = /^\d{2}:\d{2}$/;
  if (!time.test(from) || !time.test(to) || from >= to) {
    throw new AppError(400, 'Въведете начален и краен час във вида 07:30, като началото е преди края.');
  }
  const entries = await listEntries();
  const busy = new Set(
    entries
      .filter((e) => e.day === day && e.startsAt < to && from < e.endsAt)
      .filter((e) => e.groups.some((g) => attends(e, g.name, week)))
      .map((e) => e.room),
  );
  return [...new Set(entries.map((e) => e.room))].filter((r) => !busy.has(r)).sort();
}

export type NewNote = { entryId: number; week: number | null; text: string };

/** Adds a note that every student of that class sees. Publishers only. */
export async function addNote(actor: Actor | null, { entryId, week, text }: NewNote): Promise<Note> {
  const publisher = requirePublisher(actor, 'Само публикуващ може да добавя бележки.');
  const clean = text.trim();
  if (clean.length < 1 || clean.length > 500) throw new AppError(400, 'Бележката трябва да е между 1 и 500 знака.');
  if (week !== null) checkWeek(week);
  if (!Number.isInteger(entryId) || !(await entryExists(entryId))) throw new AppError(404, 'Занятието не е намерено.');
  return insertNote(entryId, week, clean, publisher.id);
}

/** Deletes a class. Publishers only: a student is refused, whatever the UI shows. */
export async function deleteClass(actor: Actor | null, id: number): Promise<void> {
  requirePublisher(actor, 'Само публикуващ може да изтрива занятия.');
  if (!Number.isInteger(id) || !(await deleteEntry(id))) throw new AppError(404, 'Занятието не е намерено.');
}
