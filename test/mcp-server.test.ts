import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { handle } from '../mcp-server/server';
import { entryExists, listEntries, type Entry, type Parity } from '../src/data/entries';
import { insertNote, listNotes } from '../src/data/notes';
import { getWeek } from '../src/services/schedule';

// The data layer is replaced by the seeded schedule; the tools run the real services.
vi.mock('../src/data/entries', () => ({ listEntries: vi.fn(), entryExists: vi.fn(), deleteEntry: vi.fn() }));
vi.mock('../src/data/notes', () => ({ listNotes: vi.fn(), insertNote: vi.fn() }));

type SeedEntry = Omit<Entry, 'id' | 'groups'> & { groups: [string, Parity][] };
const seed: SeedEntry[] = JSON.parse(readFileSync('db/seed/fkst-ksi-mag-2026-winter.json', 'utf8')).entries;
const entries: Entry[] = seed.map((e, i) => ({ ...e, id: i + 1, groups: e.groups.map(([name, parity]) => ({ name, parity })) }));

const student = { id: 'u1', role: 'student' };
const publisher = { id: 'u2', role: 'publisher' };

const call = (name: string, args: object, actor: typeof student | null) =>
  handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, actor) as Promise<{
    result: { content: { text: string }[]; isError: boolean };
  }>;
const text = (reply: Awaited<ReturnType<typeof call>>) => reply.result.content[0].text;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listEntries).mockImplementation(async () => structuredClone(entries));
  vi.mocked(listNotes).mockResolvedValue([]);
});

describe('MCP tools', () => {
  test('AC-14 get_my_week with a student token for week 3 returns the same classes as the week view', async () => {
    vi.mocked(listNotes).mockResolvedValue([{ id: 1, entryId: 4, week: 3, text: 'Задължително' }]);
    const reply = await call('get_my_week', { group: '222', week: 3 }, student);
    const weekView = await getWeek(student, '222', 3);
    expect(reply.result.isError).toBe(false);
    expect(weekView).toHaveLength(9);
    expect(weekView.find((c) => c.id === 4)?.notes).toHaveLength(1);
    expect(JSON.parse(text(reply))).toEqual(weekView);
  });

  test('AC-14 add_class_note called by a student is refused and no note is added', async () => {
    const reply = await call('add_class_note', { entry_id: 18, week: 6, text: 'Отменено' }, student);
    expect(reply.result).toMatchObject({ isError: true, content: [{ text: 'Само публикуващ може да добавя бележки.' }] });
    expect(insertNote).not.toHaveBeenCalled();
  });

  test('add_class_note called by a publisher adds the note, for one week or for every week', async () => {
    vi.mocked(entryExists).mockResolvedValue(true);
    expect((await call('add_class_note', { entry_id: 18, week: 6, text: 'Отменено' }, publisher)).result.isError).toBe(false);
    expect((await call('add_class_note', { entry_id: 18, text: 'Задължителна' }, publisher)).result.isError).toBe(false);
    expect(insertNote).toHaveBeenNthCalledWith(1, 18, 6, 'Отменено', 'u2');
    expect(insertNote).toHaveBeenNthCalledWith(2, 18, null, 'Задължителна', 'u2');
  });

  test('without a valid MCP_TOKEN every project tool is refused like a visitor', async () => {
    const reply = await call('search_classes', { query: '1211' }, null);
    expect(reply.result).toMatchObject({ isError: true, content: [{ text: 'Влезте в профила си.' }] });
  });

  test('search_classes and find_free_rooms return what the services return', async () => {
    expect(JSON.parse(text(await call('search_classes', { query: '1211' }, student)))).toHaveLength(3);
    const rooms = JSON.parse(text(await call('find_free_rooms', { day: 1, from: '07:30', to: '10:15', week: 3 }, student)));
    expect(rooms).not.toContain('1216');
  });

  test('an unexpected failure is a tool error with no details', async () => {
    vi.mocked(listEntries).mockRejectedValue(new Error('connection refused'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reply = await call('get_my_week', { group: '222', week: 3 }, student);
    expect(reply.result).toMatchObject({ isError: true, content: [{ text: 'Нещо се обърка. Опитайте отново.' }] });
  });
});
