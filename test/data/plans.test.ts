import { beforeEach, describe, expect, test, vi } from 'vitest';
import { db } from '../../src/data/db';
import * as plans from '../../src/data/plans';

// A fake pool that records every query: it checks the SQL sent and that a model answer is saved
// in one transaction, only while the plan is still being processed. The SQL itself was run by hand.
vi.mock('../../src/data/db', () => ({ db: vi.fn() }));

const client = { query: vi.fn(), release: vi.fn() };
const pool = { query: vi.fn(), connect: vi.fn(async () => client) };
const sql = (mock: typeof pool.query) => mock.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' ').trim());
const windows = [{ day: 1, from: '09:00', to: '16:30', what: 'работа' }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db).mockReturnValue(pool as never);
  pool.query.mockResolvedValue({ rows: [], rowCount: 1 });
  client.query.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe('applyModelAnswer', () => {
  test('saves the windows, the subjects and the new instructions in one transaction', async () => {
    expect(await plans.applyModelAnswer(3, { windows, subjects: { 'УП|lab': '221а' }, instructions: ['а', 'б'] })).toBe(true);
    const sent = sql(client.query);
    expect(sent[0]).toBe('BEGIN');
    expect(sent[1]).toMatch(/UPDATE plans SET windows = \$2.*WHERE id = \$1 AND model_status = 'processing'/);
    expect(client.query.mock.calls[1][1]).toEqual([3, JSON.stringify(windows), JSON.stringify({ 'УП|lab': '221а' })]);
    expect(sent[2]).toBe('DELETE FROM plan_sources WHERE plan_id = $1 AND text IS NOT NULL');
    expect(client.query.mock.calls.slice(3, 5).map((c) => c[1])).toEqual([[3, 'а'], [3, 'б']]);
    expect(sent.at(-1)).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('without subjects or instructions only the windows change', async () => {
    await plans.applyModelAnswer(3, { windows });
    expect(client.query.mock.calls[1][1]).toEqual([3, JSON.stringify(windows), null]);
    expect(sql(client.query)).not.toContain('DELETE FROM plan_sources WHERE plan_id = $1 AND text IS NOT NULL');
  });

  test('a plan changed meanwhile (no longer processing) is left alone', async () => {
    client.query.mockImplementation(async (text: string) => ({ rows: [], rowCount: text.startsWith('UPDATE') ? 0 : 1 }));
    expect(await plans.applyModelAnswer(3, { windows })).toBe(false);
    expect(sql(client.query).at(-1)).toBe('ROLLBACK');
  });

  test('a failure rolls back and is passed on', async () => {
    client.query.mockImplementation(async (text: string) => {
      if (text.startsWith('DELETE')) throw new Error('db down');
      return { rows: [], rowCount: 1 };
    });
    await expect(plans.applyModelAnswer(3, { windows, instructions: ['а'] })).rejects.toThrow('db down');
    expect(sql(client.query)).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});

describe('the other queries send their parameters', () => {
  test('plans, sharing, sources, chat and the queue', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 7 }], rowCount: 1 });
    expect(await plans.insertPlan('ana', 'Зима', null)).toBe(7);
    expect(pool.query.mock.calls.at(-1)![1]).toEqual(['ana', 'Зима', null]);
    await plans.setMyGroup(7, '222');
    await plans.setSubjects(7, { 'УП|lab': null });
    expect(pool.query.mock.calls.at(-1)![1]).toEqual([7, JSON.stringify({ 'УП|lab': null })]);
    expect(await plans.findPlan(7)).toEqual({ id: 7 });
    expect(await plans.listPlansFor('ana')).toEqual({ own: [{ id: 7 }], shared: [{ id: 7 }] });
    expect(await plans.listOtherPlans('ana')).toEqual([{ id: 7 }]);
    expect(await plans.isSharedWith(7, 'boris')).toBe(true);
    await plans.deletePlan(7);
    await plans.saveWindows(7, windows, 'parser', 'queued');
    expect(pool.query.mock.calls.at(-1)![1]).toEqual([7, JSON.stringify(windows), 'parser', 'queued']);
    await plans.failPlan(7);
    expect(sql(pool.query).at(-1)).toMatch(/model_status = 'failed'.*AND model_status = 'processing'/);
    expect(await plans.claimNextPlan()).toBe(7);
    expect(sql(pool.query).at(-1)).toMatch(/FOR UPDATE SKIP LOCKED LIMIT 1/);
    await plans.listSources(7);
    await plans.listSourceImages(7);
    expect(await plans.findSourceImage(7, 1)).toEqual({ id: 7 });
    await plans.insertSource(7, { text: 'х' });
    await plans.insertSource(7, { image: Buffer.from('p'), imageType: 'image/png' });
    expect(await plans.deleteSource(7, 1)).toBe(true);
    await plans.listMessages(7);
    await plans.insertMessage(7, 'user', 'здравей');
    await plans.listShares(7);
    await plans.addShare(7, 'boris');
    await plans.removeShare(7, 'boris');
    expect(pool.query.mock.calls.at(-1)![1]).toEqual([7, 'boris']);
    pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await plans.findPlan(8)).toBeNull();
    expect(await plans.claimNextPlan()).toBeNull();
    expect(await plans.findSourceImage(7, 2)).toBeNull();
  });
});
