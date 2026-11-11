import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { entryExists, listEntries, type Entry, type Parity } from '../../src/data/entries';
import { insertNote, listNotes, type Note } from '../../src/data/notes';
import { addNote, findFreeRooms, getWeek, searchClasses } from '../../src/services/schedule';

// The data layer is replaced by the real seeded schedule, so these tests check the rules
// against the classes students actually see, without a database.
vi.mock('../../src/data/entries', () => ({ listEntries: vi.fn(), entryExists: vi.fn(), deleteEntry: vi.fn() }));
vi.mock('../../src/data/notes', () => ({ listNotes: vi.fn(), insertNote: vi.fn() }));

type SeedEntry = Omit<Entry, 'id' | 'groups'> & { groups: [string, Parity][] };
const seed: SeedEntry[] = JSON.parse(readFileSync('db/seed/fkst-ksi-mag-2026-winter.json', 'utf8')).entries;
const entries: Entry[] = seed.map((e, i) => ({ ...e, id: i + 1, groups: e.groups.map(([name, parity]) => ({ name, parity })) }));
const find = (course: string, type: string, day: number) => entries.find((e) => e.course === course && e.type === type && e.day === day)!;

const student = { id: 'u1', role: 'student' };
const publisher = { id: 'u2', role: 'publisher' };
let notes: Note[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  notes = [];
  vi.mocked(listEntries).mockImplementation(async () => structuredClone(entries));
  vi.mocked(listNotes).mockImplementation(async () => notes);
});

const show = (classes: Entry[]) => classes.map((c) => `${c.course} ${c.type} ${c.day} ${c.startsAt}–${c.endsAt} ${c.room}`);

describe('getWeek', () => {
  test('AC-1 group 222 sees the УП lab on Monday 13:45 in 705 in week 3, not in week 4 (even) or week 1 (before it starts)', async () => {
    const lab = 'УП lab 1 13:45–16:30 705';
    expect(show(await getWeek(student, '222', 3))).toContain(lab);
    expect(show(await getWeek(student, '222', 4))).not.toContain(lab);
    expect(show(await getWeek(student, '222', 1))).not.toContain(lab);
  });

  test('AC-2 group 221а does not see the Wednesday ПИ lab in week 1, and sees it in room 1211 in week 3', async () => {
    const lab = 'ПИ lab 3 07:30–10:15 1211';
    expect(show(await getWeek(student, '221а', 1))).not.toContain(lab);
    expect(show(await getWeek(student, '221а', 3))).toContain(lab);
  });

  test('AC-7 a publisher who adds "Отменено" to the Saturday КЗ lab of 222 for week 6 cancels it in week 6 only', async () => {
    const lab = entries.find((e) => e.course === 'КЗ' && e.day === 6 && e.groups.some((g) => g.name === '222'))!;
    vi.mocked(entryExists).mockResolvedValue(true);
    vi.mocked(insertNote).mockImplementation(async (entryId, week, text) => {
      const note = { id: notes.length + 1, entryId, week, text };
      notes.push(note);
      return note;
    });
    await addNote(publisher, { entryId: lab.id, week: 6, text: 'Отменено' });
    const week6 = (await getWeek(student, '222', 6)).find((c) => c.id === lab.id)!;
    const week8 = (await getWeek(student, '222', 8)).find((c) => c.id === lab.id)!;
    expect(week6).toMatchObject({ cancelled: true, notes: [{ text: 'Отменено' }] });
    expect(week8).toMatchObject({ cancelled: false, notes: [] });
  });

  test('a note for every week is shown every week, and only a note starting with "Отменено" cancels', async () => {
    const lecture = find('КЗ', 'lecture', 1);
    notes = [{ id: 1, entryId: lecture.id, week: null, text: 'Задължителна лекция' }];
    const week2 = (await getWeek(student, '222', 2)).find((c) => c.id === lecture.id)!;
    expect(week2).toMatchObject({ cancelled: false, notes: [{ text: 'Задължителна лекция' }] });
  });

  test('the classes come sorted by day and time', async () => {
    const days = (await getWeek(student, '222', 3)).map((c) => `${c.day} ${c.startsAt}`);
    expect(days).toEqual([...days].sort());
  });

  test('a group that is not in the schedule gives 404', async () => {
    await expect(getWeek(student, '999', 3)).rejects.toMatchObject({ status: 404 });
  });

  test.each([0, 16, 2.5, NaN])('week %s gives 400', async (week) => {
    await expect(getWeek(student, '222', week)).rejects.toMatchObject({ status: 400 });
  });

  test('somebody who is not signed in gets 401', async () => {
    await expect(getWeek(null, '222', 3)).rejects.toMatchObject({ status: 401 });
    expect(listEntries).not.toHaveBeenCalled();
  });
});

describe('searchClasses', () => {
  test('AC-12 searching for "1211" lists the ПИ labs on Wednesday and Thursday and the КЗ lab on Saturday, and nothing else', async () => {
    expect(show(await searchClasses(student, ' 1211 '))).toEqual([
      'ПИ lab 3 07:30–10:15 1211',
      'ПИ lab 4 07:30–10:15 1211',
      'КЗ lab 6 10:30–13:15 1211',
    ]);
  });

  test('finds a course by part of its name, ignoring case, and a group by its exact name', async () => {
    expect((await searchClasses(student, 'java')).every((c) => c.course.includes('Java'))).toBe(true);
    expect((await searchClasses(student, '222')).every((c) => c.groups.some((g) => g.name === '222'))).toBe(true);
  });

  test('an empty search returns nothing without reading the schedule', async () => {
    expect(await searchClasses(student, '  ')).toEqual([]);
    expect(listEntries).not.toHaveBeenCalled();
  });

  test('somebody who is not signed in gets 401', async () => {
    await expect(searchClasses(null, '1211')).rejects.toMatchObject({ status: 401 });
  });
});

describe('findFreeRooms', () => {
  const monday = { day: 1, from: '07:30', to: '10:15', week: 3 };

  test('AC-13 free rooms on Monday 07:30–10:15 in week 3 do not include 1216, where the ОИТ lecture is', async () => {
    const rooms = await findFreeRooms(student, monday);
    expect(rooms).not.toContain('1216');
    expect(rooms).toContain('705');
  });

  test('a room whose only class that day has not started yet is free', async () => {
    // The Monday УП lab in 705 starts in week 3, so in week 1 room 705 is free at 13:45.
    expect(await findFreeRooms(student, { day: 1, from: '13:45', to: '16:30', week: 1 })).toContain('705');
    expect(await findFreeRooms(student, { day: 1, from: '13:45', to: '16:30', week: 3 })).not.toContain('705');
  });

  test.each([
    { ...monday, day: 7 },
    { ...monday, from: '7:30' },
    { ...monday, from: '10:15', to: '07:30' },
    { ...monday, week: 0 },
  ])('a wrong day, time or week gives 400: %o', async (query) => {
    await expect(findFreeRooms(student, query)).rejects.toMatchObject({ status: 400 });
  });

  test('somebody who is not signed in gets 401', async () => {
    await expect(findFreeRooms(null, monday)).rejects.toMatchObject({ status: 401 });
  });
});

describe('addNote', () => {
  const note = { entryId: 18, week: 6, text: '  Отменено ' };

  test('a publisher adds a note, trimmed, signed with their id', async () => {
    vi.mocked(entryExists).mockResolvedValue(true);
    vi.mocked(insertNote).mockResolvedValue({ id: 1, entryId: 18, week: 6, text: 'Отменено' });
    await addNote(publisher, note);
    expect(insertNote).toHaveBeenCalledWith(18, 6, 'Отменено', 'u2');
  });

  test('a note for every week has no week', async () => {
    vi.mocked(entryExists).mockResolvedValue(true);
    await addNote(publisher, { ...note, week: null });
    expect(insertNote).toHaveBeenCalledWith(18, null, 'Отменено', 'u2');
  });

  test('a student gets 403 and no note is added', async () => {
    await expect(addNote(student, note)).rejects.toMatchObject({ status: 403 });
    expect(insertNote).not.toHaveBeenCalled();
  });

  test('somebody who is not signed in gets 401', async () => {
    await expect(addNote(null, note)).rejects.toMatchObject({ status: 401 });
  });

  test.each(['', '   ', 'x'.repeat(501)])('an empty or too long note gives 400', async (text) => {
    await expect(addNote(publisher, { ...note, text })).rejects.toMatchObject({ status: 400 });
    expect(insertNote).not.toHaveBeenCalled();
  });

  test('a week outside 1–15 gives 400', async () => {
    await expect(addNote(publisher, { ...note, week: 16 })).rejects.toMatchObject({ status: 400 });
  });

  test.each([999, 1.5])('class %s that does not exist gives 404', async (entryId) => {
    vi.mocked(entryExists).mockResolvedValue(false);
    await expect(addNote(publisher, { ...note, entryId })).rejects.toMatchObject({ status: 404 });
    expect(insertNote).not.toHaveBeenCalled();
  });
});
