// The timetable of one plan: the subjects it follows, the week view, search, notes and deleting a class.
// Reading needs read access to the plan; changing it needs the owner or an admin (src/services/access.ts).
import type { Actor } from '../auth';
import { deleteEntry, findEntryPlan, listEntries, type Entry } from '../data/entries';
import { deleteNote as deleteNoteRow, findNoteEntry, insertNote, listNotes, type Note } from '../data/notes';
import type { Plan } from '../data/plans';
import { editablePlan, readablePlan } from './access';
import { AppError } from './errors';

export const LAST_WEEK = 15;

export type WeekClass = Entry & { notes: Note[]; cancelled: boolean; skipped: boolean };

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

/** A subject is a course and a kind of class: the УП lecture and the УП lab are two subjects. */
export const subjectKey = (e: Pick<Entry, 'course' | 'type'>) => `${e.course}|${e.type}`;

/** The group whose sessions of this class's subject the plan follows: the student's choice for the
 *  subject, or else their own group; null means the subject is not taken. */
export function followedGroup(plan: Pick<Plan, 'myGroup' | 'subjects'>, entry: Entry): string | null {
  const key = subjectKey(entry);
  return key in plan.subjects ? plan.subjects[key] : plan.myGroup;
}

export type Subject = { key: string; course: string; type: Entry['type']; groups: string[]; chosen: string | null; byDefault: boolean };

/** Every subject of a timetable, the groups that have it, and which one the plan follows. */
export function subjectsOf(entries: Entry[], plan: Pick<Plan, 'myGroup' | 'subjects'>): Subject[] {
  const byKey = new Map<string, Subject>();
  for (const e of [...entries].sort(byDayAndTime)) {
    const key = subjectKey(e);
    const s = byKey.get(key) ?? { key, course: e.course, type: e.type, groups: [], chosen: null, byDefault: !(key in plan.subjects) };
    for (const g of e.groups) if (!s.groups.includes(g.name)) s.groups.push(g.name);
    byKey.set(key, s);
  }
  return [...byKey.values()].map((s) => {
    const followed = s.byDefault ? plan.myGroup : plan.subjects[s.key];
    return { ...s, groups: s.groups.sort(), chosen: followed && s.groups.includes(followed) ? followed : null };
  });
}

/** A note "Отменено" (for that week, or for every week) cancels the class. */
const isCancelling = (note: Note) => /^отменено/i.test(note.text.trim());
/** A note "Не ходя" (for that week, or for every week) means the student skips that one class. */
export const SKIP_NOTE = 'Не ходя';
const isSkipping = (note: Note) => /^не ходя/i.test(note.text.trim());

/** Every class of the plan's timetable, sorted by day and start time. */
export async function listClasses(actor: Actor | null, planId: number): Promise<Entry[]> {
  await readablePlan(actor, planId);
  return (await listEntries(planId)).sort(byDayAndTime);
}

/** The classes the plan follows in one week (its group, or the group chosen for a subject), with the notes for that week. */
export async function getWeek(actor: Actor | null, planId: number, week: number): Promise<WeekClass[]> {
  const { plan } = await readablePlan(actor, planId);
  checkWeek(week);
  const notes = await listNotes(planId);
  return (await listEntries(planId))
    .filter((e) => {
      const group = followedGroup(plan, e);
      return group !== null && attends(e, group, week);
    })
    .sort(byDayAndTime)
    .map((e) => {
      const own = notes.filter((n) => n.entryId === e.id && (n.week === null || n.week === week));
      return { ...e, notes: own, cancelled: own.some(isCancelling), skipped: own.some(isSkipping) };
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

/** Removes a note (also "Не ходя", which brings the class back). Owner or admin only. */
export async function deleteNote(actor: Actor | null, noteId: number): Promise<void> {
  const entryId = Number.isInteger(noteId) ? await findNoteEntry(noteId) : null;
  if (entryId === null) throw new AppError(404, 'Бележката не е намерена.');
  await editableClass(actor, entryId);
  await deleteNoteRow(noteId);
}

/** Deletes a class from the plan's timetable. Owner or admin only, whatever the UI shows. */
export async function deleteClass(actor: Actor | null, entryId: number): Promise<void> {
  await editableClass(actor, entryId);
  await deleteEntry(entryId);
}
