import { beforeEach, describe, expect, test, vi } from 'vitest';
import { handle } from '../mcp-server/server';
import * as entries from '../src/data/entries';
import { addNote, getWeek } from '../src/services/schedule';
import { createPlan } from '../src/services/plans';
import { ana, installFakes, vera, type Store } from './fakes';

// The data layer is an in-memory store with a plan from the sample timetable; the tools run the real services.
vi.mock('../src/data/entries');
vi.mock('../src/data/notes');
vi.mock('../src/data/plans');
vi.mock('../src/data/users');

type Reply = { result: { content: { text: string }[]; isError: boolean } };
const call = (name: string, args: object, actor: typeof ana | null) =>
  handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, actor) as Promise<Reply>;
const text = (reply: Reply) => reply.result.content[0].text;

let db: Store;
let planId: number;
beforeEach(async () => {
  vi.resetAllMocks();
  db = installFakes();
  planId = await createPlan(ana, { name: 'Зима', myGroup: '222', fromSample: true });
});

describe('MCP tools', () => {
  test('AC-14 get_my_week with a student token and their plan id for week 3 returns the same classes as the plan page', async () => {
    const lab = db.entries.find((e) => e.course === 'УП' && e.type === 'lab' && e.day === 1)!.id;
    await addNote(ana, { entryId: lab, week: 3, text: 'Задължително' });
    const reply = await call('get_my_week', { plan_id: planId, week: 3 }, ana);
    const planPage = await getWeek(ana, planId, 3);
    expect(reply.result.isError).toBe(false);
    expect(planPage).toHaveLength(9);
    expect(planPage.find((c) => c.id === lab)?.notes).toHaveLength(1);
    expect(JSON.parse(text(reply))).toEqual(planPage);
  });

  test('AC-14 add_class_note on a class of someone else\'s plan is refused and no note is added', async () => {
    const reply = await call('add_class_note', { entry_id: 18, week: 6, text: 'Отменено' }, vera);
    expect(reply.result).toMatchObject({ isError: true, content: [{ text: 'Тази програма не е споделена с вас.' }] });
    expect(db.notes).toHaveLength(0);
  });

  test('add_class_note by the owner adds the note, for one week or for every week', async () => {
    expect((await call('add_class_note', { entry_id: 18, week: 6, text: 'Отменено' }, ana)).result.isError).toBe(false);
    expect((await call('add_class_note', { entry_id: 18, text: 'Задължителна' }, ana)).result.isError).toBe(false);
    expect(db.notes.map((n) => [n.entryId, n.week, n.text])).toEqual([
      [18, 6, 'Отменено'],
      [18, null, 'Задължителна'],
    ]);
  });

  test('without a valid MCP_TOKEN every project tool is refused like a visitor', async () => {
    const reply = await call('search_classes', { plan_id: planId, query: '1211' }, null);
    expect(reply.result).toMatchObject({ isError: true, content: [{ text: 'Влезте в профила си.' }] });
  });

  test('search_classes returns what the service returns', async () => {
    expect(JSON.parse(text(await call('search_classes', { plan_id: planId, query: '1211' }, ana)))).toHaveLength(3);
  });

  test('an unexpected failure is a tool error with no details', async () => {
    vi.mocked(entries.listEntries).mockRejectedValue(new Error('connection refused'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reply = await call('get_my_week', { plan_id: planId, week: 3 }, ana);
    expect(reply.result).toMatchObject({ isError: true, content: [{ text: 'Нещо се обърка. Опитайте отново.' }] });
  });
});
