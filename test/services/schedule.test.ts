import { beforeEach, describe, expect, test, vi } from 'vitest';
import { deleteEntry, listEntries, type Entry } from '../../src/data/entries';
import { deleteClass, listClasses } from '../../src/services/schedule';

// The data layer is replaced, so these tests check the rules, not the database.
vi.mock('../../src/data/entries', () => ({ listEntries: vi.fn(), deleteEntry: vi.fn() }));

const student = { id: 'u1', role: 'student' };
const publisher = { id: 'u2', role: 'publisher' };

const entry = (id: number, day: number, startsAt: string): Entry => ({
  id,
  course: 'ПИ',
  type: 'lab',
  day,
  startsAt,
  endsAt: '10:15',
  room: '1211',
  startWeek: 2,
  groups: [{ name: '222', parity: 'odd' }],
});

beforeEach(() => vi.resetAllMocks());

describe('listClasses', () => {
  test('AC-16 a signed-in student gets the classes from entries, sorted by day and time', async () => {
    vi.mocked(listEntries).mockResolvedValue([entry(3, 2, '07:30'), entry(2, 1, '13:45'), entry(1, 1, '07:30')]);
    const classes = await listClasses(student);
    expect(classes.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  test('keeps the database order for two classes at the same time', async () => {
    vi.mocked(listEntries).mockResolvedValue([entry(5, 1, '13:45'), entry(4, 1, '13:45')]);
    expect((await listClasses(student)).map((c) => c.id)).toEqual([4, 5]);
  });

  test('somebody who is not signed in gets 401 and no classes', async () => {
    await expect(listClasses(null)).rejects.toMatchObject({ status: 401 });
    expect(listEntries).not.toHaveBeenCalled();
  });
});

describe('deleteClass', () => {
  test('AC-18 a publisher deletes a class and its row is removed', async () => {
    vi.mocked(deleteEntry).mockResolvedValue(true);
    await deleteClass(publisher, 7);
    expect(deleteEntry).toHaveBeenCalledWith(7);
  });

  test('AC-18 a student who tries to delete a class gets 403 and nothing is removed', async () => {
    await expect(deleteClass(student, 7)).rejects.toMatchObject({ status: 403 });
    expect(deleteEntry).not.toHaveBeenCalled();
  });

  test('somebody who is not signed in gets 401 and nothing is removed', async () => {
    await expect(deleteClass(null, 7)).rejects.toMatchObject({ status: 401 });
    expect(deleteEntry).not.toHaveBeenCalled();
  });

  test('a class that does not exist gives 404', async () => {
    vi.mocked(deleteEntry).mockResolvedValue(false);
    await expect(deleteClass(publisher, 999)).rejects.toMatchObject({ status: 404 });
  });

  test('an id that is not a number gives 404 without touching the database', async () => {
    await expect(deleteClass(publisher, Number('abc'))).rejects.toMatchObject({ status: 404 });
    expect(deleteEntry).not.toHaveBeenCalled();
  });
});
