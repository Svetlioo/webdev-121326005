import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Entry } from '../../src/data/entries';
import { chooseSubject, createPlan, setMyGroup, sharePlan } from '../../src/services/plans';
import { addNote, deleteClass, getWeek, listClasses, searchClasses, subjectsOf } from '../../src/services/schedule';
import { admin, ana, boris, installFakes, vera, type Store } from '../fakes';

// The data layer is an in-memory store (test/fakes.ts); a plan starts from the real sample timetable.
vi.mock('../../src/data/entries');
vi.mock('../../src/data/notes');
vi.mock('../../src/data/plans');
vi.mock('../../src/data/users');

let db: Store;
let plan222: number;
beforeEach(async () => {
  vi.resetAllMocks();
  db = installFakes();
  plan222 = await createPlan(ana, { name: 'Зима', myGroup: '222', fromSample: true });
});

const show = (classes: Entry[]) => classes.map((c) => `${c.course} ${c.type} ${c.day} ${c.startsAt}–${c.endsAt} ${c.room}`);
const sampleId = (course: string, type: string, day: number, startsAt: string) =>
  db.entries.find((e) => e.planId === plan222 && e.course === course && e.type === type && e.day === day && e.startsAt === startsAt)!.id;

describe('the timetable of a plan', () => {
  test('AC-16 a plan from the sample timetable has its 19 classes, sorted by day and time', async () => {
    const classes = await listClasses(ana, plan222);
    expect(classes).toHaveLength(19);
    const order = classes.map((c) => `${c.day} ${c.startsAt}`);
    expect(order).toEqual([...order].sort());
  });

  test('an empty plan has no classes until the student imports a timetable', async () => {
    const empty = await createPlan(ana, { name: 'Празна', myGroup: '222' });
    expect(await listClasses(ana, empty)).toEqual([]);
    expect(await getWeek(ana, empty, 3)).toEqual([]);
  });

  test('AC-1 group 222 sees the УП lab on Monday 13:45 in 705 in week 3, not in week 4 (even) or week 1 (before it starts)', async () => {
    const lab = 'УП lab 1 13:45–16:30 705';
    expect(show(await getWeek(ana, plan222, 3))).toContain(lab);
    expect(show(await getWeek(ana, plan222, 4))).not.toContain(lab);
    expect(show(await getWeek(ana, plan222, 1))).not.toContain(lab);
  });

  test('AC-2 group 221а does not see the Wednesday ПИ lab in week 1, and sees it in room 1211 in week 3', async () => {
    const plan221a = await createPlan(ana, { name: '221а', myGroup: '221а', fromSample: true });
    const lab = 'ПИ lab 3 07:30–10:15 1211';
    expect(show(await getWeek(ana, plan221a, 1))).not.toContain(lab);
    expect(show(await getWeek(ana, plan221a, 3))).toContain(lab);
  });

  test('AC-13 setting the УП lab to group 221а shows it on Thursday 10:30 in 705 instead of Monday; "not taken" hides a subject; a group without the subject is 400', async () => {
    await chooseSubject(ana, plan222, { course: 'УП', type: 'lab', group: '221а' });
    const week3 = show(await getWeek(ana, plan222, 3));
    expect(week3).toContain('УП lab 4 10:30–13:15 705');
    expect(week3).not.toContain('УП lab 1 13:45–16:30 705');
    await chooseSubject(ana, plan222, { course: 'КЗ', type: 'lecture', group: null });
    for (const w of [1, 2, 3, 4]) expect(show(await getWeek(ana, plan222, w)).some((c) => c.startsWith('КЗ lecture'))).toBe(false);
    const before = structuredClone(db.plans[0].subjects);
    await expect(chooseSubject(ana, plan222, { course: 'МСВИВИ', type: 'lecture', group: '221б' })).rejects.toMatchObject({ status: 400 });
    await expect(chooseSubject(ana, plan222, { course: 'Няма', type: 'lab', group: null })).rejects.toMatchObject({ status: 400 });
    expect(db.plans[0].subjects).toEqual(before);
  });

  test('a subject held twice a week by the same group lists that group once; a choice of a group without the subject means not taken', () => {
    const lab = (id: number, day: number): Entry => ({ id, course: 'ПИ', type: 'lab', day, startsAt: '07:30', endsAt: '10:15', room: '1211', startWeek: 1, groups: [{ name: '222', parity: 'all' }] });
    expect(subjectsOf([lab(1, 3), lab(2, 4)], { myGroup: '222', subjects: {} })).toEqual([
      { key: 'ПИ|lab', course: 'ПИ', type: 'lab', groups: ['222'], chosen: '222', byDefault: true },
    ]);
    expect(subjectsOf([lab(1, 3)], { myGroup: '221а', subjects: {} })[0].chosen).toBeNull();
  });

  test('a plan with no group yet shows nothing; choosing a group from the timetable shows its classes', async () => {
    const none = await createPlan(ana, { name: 'Без група', fromSample: true });
    expect(await getWeek(ana, none, 3)).toEqual([]);
    await expect(setMyGroup(ana, none, '999')).rejects.toMatchObject({ status: 400 });
    await setMyGroup(ana, none, '222');
    expect(show(await getWeek(ana, none, 3))).toContain('УП lab 1 13:45–16:30 705');
    await expect(setMyGroup(boris, none, '222')).rejects.toMatchObject({ status: 403 });
  });

  test.each([0, 16, 2.5, NaN])('week %s gives 400', async (week) => {
    await expect(getWeek(ana, plan222, week)).rejects.toMatchObject({ status: 400 });
  });

  test('AC-12 searching for "1211" lists the ПИ labs on Wednesday and Thursday and the КЗ lab on Saturday, and nothing else', async () => {
    expect(show(await searchClasses(ana, plan222, ' 1211 '))).toEqual([
      'ПИ lab 3 07:30–10:15 1211',
      'ПИ lab 4 07:30–10:15 1211',
      'КЗ lab 6 10:30–13:15 1211',
    ]);
  });

  test('search finds a course by part of its name, a group by its exact name, and nothing for an empty text', async () => {
    expect((await searchClasses(ana, plan222, 'java')).every((c) => c.course.includes('Java'))).toBe(true);
    expect((await searchClasses(ana, plan222, '222')).every((c) => c.groups.some((g) => g.name === '222'))).toBe(true);
    expect(await searchClasses(ana, plan222, '  ')).toEqual([]);
  });

});

describe('notes', () => {
  test('AC-7 the owner adds "Отменено" to the Saturday КЗ lab for week 6: cancelled in week 6, normal in week 8, the same for a reader', async () => {
    const lab = sampleId('КЗ', 'lab', 6, '10:30');
    await addNote(ana, { entryId: lab, week: 6, text: 'Отменено' });
    await sharePlan(ana, plan222, 'boris@test.bg');
    for (const who of [ana, boris]) {
      expect((await getWeek(who, plan222, 6)).find((c) => c.id === lab)).toMatchObject({ cancelled: true, notes: [{ text: 'Отменено' }] });
      expect((await getWeek(who, plan222, 8)).find((c) => c.id === lab)).toMatchObject({ cancelled: false, notes: [] });
    }
  });

  test('a note for every week shows every week, and only a note starting with "Отменено" cancels', async () => {
    const lecture = sampleId('КЗ', 'lecture', 1, '16:45');
    await addNote(ana, { entryId: lecture, week: null, text: '  Задължителна лекция ' });
    expect((await getWeek(ana, plan222, 2)).find((c) => c.id === lecture)).toMatchObject({ cancelled: false, notes: [{ text: 'Задължителна лекция' }] });
  });

  test('a reader or a stranger cannot add a note (403); an admin can', async () => {
    const lab = sampleId('КЗ', 'lab', 6, '10:30');
    await sharePlan(ana, plan222, 'boris@test.bg');
    await expect(addNote(boris, { entryId: lab, week: 6, text: 'x' })).rejects.toMatchObject({ status: 403 });
    await expect(addNote(vera, { entryId: lab, week: 6, text: 'x' })).rejects.toMatchObject({ status: 403 });
    await expect(addNote(null, { entryId: lab, week: 6, text: 'x' })).rejects.toMatchObject({ status: 401 });
    expect(db.notes).toHaveLength(0);
    await addNote(admin, { entryId: lab, week: 6, text: 'Проверено' });
    expect(db.notes).toHaveLength(1);
  });

  test.each(['', '   ', 'x'.repeat(501)])('an empty or too long note gives 400', async (text) => {
    await expect(addNote(ana, { entryId: sampleId('КЗ', 'lab', 6, '10:30'), week: 6, text })).rejects.toMatchObject({ status: 400 });
  });

  test('a week outside 1–15 gives 400, and a class that does not exist 404', async () => {
    await expect(addNote(ana, { entryId: sampleId('КЗ', 'lab', 6, '10:30'), week: 16, text: 'x' })).rejects.toMatchObject({ status: 400 });
    await expect(addNote(ana, { entryId: 999, week: 6, text: 'x' })).rejects.toMatchObject({ status: 404 });
    await expect(addNote(ana, { entryId: 1.5, week: 6, text: 'x' })).rejects.toMatchObject({ status: 404 });
  });
});

describe('deleting a class', () => {
  test('AC-18 the owner deletes a class and its row is gone; a reader gets 403 and nothing is removed', async () => {
    const lab = sampleId('УП', 'lab', 1, '13:45');
    await sharePlan(ana, plan222, 'boris@test.bg');
    await expect(deleteClass(boris, lab)).rejects.toMatchObject({ status: 403 });
    expect(db.entries.some((e) => e.id === lab)).toBe(true);
    await deleteClass(ana, lab);
    expect(db.entries.some((e) => e.id === lab)).toBe(false);
    expect(await listClasses(ana, plan222)).toHaveLength(18);
  });

  test('somebody who is not signed in gets 401; a class that does not exist 404', async () => {
    await expect(deleteClass(null, sampleId('УП', 'lab', 1, '13:45'))).rejects.toMatchObject({ status: 401 });
    await expect(deleteClass(ana, 999)).rejects.toMatchObject({ status: 404 });
  });

  test('reading needs access: a stranger gets 403 for the week and search', async () => {
    await expect(getWeek(vera, plan222, 3)).rejects.toMatchObject({ status: 403 });
    await expect(searchClasses(vera, plan222, 'ПИ')).rejects.toMatchObject({ status: 403 });
    await expect(listClasses(vera, plan222)).rejects.toMatchObject({ status: 403 });
  });
});
