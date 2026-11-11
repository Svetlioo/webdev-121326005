// The timetable of one plan: the week view, search, free rooms, notes and deleting a class.
// Reading needs read access to the plan; changing it needs the owner or an admin (src/services/access.ts).
import type { Actor } from '../auth';
import { deleteEntry, findEntryPlan, listEntries, type Entry } from '../data/entries';
import { insertNote, listNotes, type Note } from '../data/notes';
import { editablePlan, readablePlan } from './access';
import { AppError } from './errors';

export const LAST_WEEK = 15;

export type WeekClass = Entry & { notes: Note[]; cancelled: boolean };

const byDayAndTime = (a: Entry, b: Entry) => a.day - b.day || a.startsAt.localeCompare(b.startsAt) || a.id - b.id;

function checkWeek(week: number): void {
  if (!Number.isInteger(week) || week < 1 || week > LAST_WEEK) {
    throw new AppError(400, `Седмицата трябва да е число от 1 до ${LAST_WEEK}.`);
  }
}

/** Does this group have this class in this week? Start week first, then odd/even weeks. */
export function attends(entry: Entry, group: string, week: number): boolean {
  const g = entry.groups.find((x) => x.name === group);
  if (!g || week < entry.startWeek) return false;
  return g.parity === 'all' || (g.parity === 'odd') === (week % 2 === 1);
}

/** A note "Отменено" (for that week, or for every week) cancels the class. */
const isCancelling = (note: Note) => /^отменено/i.test(note.text.trim());

/** Every class of the plan's timetable, sorted by day and start time. */
export async function listClasses(actor: Actor | null, planId: number): Promise<Entry[]> {
  await readablePlan(actor, planId);
  return (await listEntries(planId)).sort(byDayAndTime);
}

/** What the plan's groups have in one week, with the notes for that week. A plan with no groups chosen yet has nothing. */
export async function getWeek(actor: Actor | null, planId: number, week: number): Promise<WeekClass[]> {
  const { plan } = await readablePlan(actor, planId);
  checkWeek(week);
  const notes = await listNotes(planId);
  return (await listEntries(planId))
    .filter((e) => plan.groups.some((g) => attends(e, g, week)))
    .sort(byDayAndTime)
    .map((e) => {
      const own = notes.filter((n) => n.entryId === e.id && (n.week === null || n.week === week));
      return { ...e, notes: own, cancelled: own.some(isCancelling) };
    });
}

/** Classes whose course or room contains the text, or that a group with exactly that name attends. */
export async function searchClasses(actor: Actor | null, planId: number, query: string): Promise<Entry[]> {
  await readablePlan(actor, planId);
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return (await listEntries(planId))
    .filter(
      (e) =>
        e.course.toLowerCase().includes(q) ||
        e.room.toLowerCase().includes(q) ||
        e.groups.some((g) => g.name.toLowerCase() === q),
    )
    .sort(byDayAndTime);
}

export type FreeRoomsQuery = { day: number; from: string; to: string; week: number };

/** Rooms used somewhere in the plan's timetable that no class takes on that day, time and week. */
export async function findFreeRooms(actor: Actor | null, planId: number, { day, from, to, week }: FreeRoomsQuery): Promise<string[]> {
  await readablePlan(actor, planId);
  checkWeek(week);
  if (!Number.isInteger(day) || day < 1 || day > 6) throw new AppError(400, 'Денят трябва да е от понеделник до събота.');
  const time = /^\d{2}:\d{2}$/;
  if (!time.test(from) || !time.test(to) || from >= to) {
    throw new AppError(400, 'Въведете начален и краен час във вида 07:30, като началото е преди края.');
  }
  const entries = await listEntries(planId);
  const busy = new Set(
    entries
      .filter((e) => e.day === day && e.startsAt < to && from < e.endsAt)
      .filter((e) => e.groups.some((g) => attends(e, g.name, week)))
      .map((e) => e.room),
  );
  return [...new Set(entries.map((e) => e.room))].filter((r) => !busy.has(r)).sort();
}

/** The plan a class belongs to, if the actor may change it. */
async function editableClass(actor: Actor | null, entryId: number) {
  const planId = Number.isInteger(entryId) ? await findEntryPlan(entryId) : null;
  if (planId === null) throw new AppError(404, 'Занятието не е намерено.');
  return editablePlan(actor, planId);
}

export type NewNote = { entryId: number; week: number | null; text: string };

/** Adds a note that everyone who reads the plan sees. Owner or admin only. */
export async function addNote(actor: Actor | null, { entryId, week, text }: NewNote): Promise<Note> {
  const { actor: me } = await editableClass(actor, entryId);
  const clean = text.trim();
  if (clean.length < 1 || clean.length > 500) throw new AppError(400, 'Бележката трябва да е между 1 и 500 знака.');
  if (week !== null) checkWeek(week);
  return insertNote(entryId, week, clean, me.id);
}

/** Deletes a class from the plan's timetable. Owner or admin only, whatever the UI shows. */
export async function deleteClass(actor: Actor | null, entryId: number): Promise<void> {
  await editableClass(actor, entryId);
  await deleteEntry(entryId);
}
