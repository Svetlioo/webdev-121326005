import { beforeEach, describe, expect, test, vi } from 'vitest';
import { db } from '../../src/data/db';
import { claimNextImport, findImport, insertImport, listImports, publishDraft, updateImport } from '../../src/data/imports';

// A fake pool that records every query. It checks what SQL is sent and that publishing is one
// transaction; it does not prove the SQL against PostgreSQL (that was checked by hand).
vi.mock('../../src/data/db', () => ({ db: vi.fn() }));

const client = { query: vi.fn(), release: vi.fn() };
const pool = { query: vi.fn(), connect: vi.fn(async () => client) };
const sql = (mock: typeof pool.query) => mock.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' ').trim());

const draft = [
  { course: 'УП', type: 'lab', day: 1, startsAt: '13:45', endsAt: '16:30', room: '705', startWeek: 3, groups: [{ name: '222', parity: 'odd' as const }] },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db).mockReturnValue(pool as never);
  pool.query.mockResolvedValue({ rows: [] });
  client.query.mockResolvedValue({ rows: [{ id: 41 }], rowCount: 1 });
});

describe('publishDraft', () => {
  test('replaces only that plan\'s classes and marks the import published, in one transaction', async () => {
    expect(await publishDraft(7, 5, draft)).toBe(true);
    const sent = sql(client.query);
    expect(sent[0]).toBe('BEGIN');
    expect(sent[1]).toMatch(/UPDATE imports SET status = 'published'.* AND status = 'ready'/);
    expect(sent[2]).toBe('DELETE FROM entries WHERE plan_id = $1');
    expect(client.query.mock.calls[2][1]).toEqual([5]);
    expect(sent[3]).toMatch(/^INSERT INTO entries/);
    expect(client.query.mock.calls[3][1]).toEqual([5, 'УП', 'lab', 1, '13:45', '16:30', '705', 3]);
    expect(client.query.mock.calls[4][1]).toEqual([41, '222', 'odd']);
    expect(sent.at(-1)).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('a failure rolls everything back, so students keep the old schedule', async () => {
    client.query.mockImplementation(async (text: string) => {
      if (text.startsWith('INSERT INTO entry_groups')) throw new Error('bad group');
      return { rows: [{ id: 41 }], rowCount: 1 };
    });
    await expect(publishDraft(7, 5, draft)).rejects.toThrow('bad group');
    expect(sql(client.query)).toContain('ROLLBACK');
    expect(sql(client.query)).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('an import that is no longer ready is not published twice, and the classes stay', async () => {
    client.query.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await publishDraft(7, 5, draft)).toBe(false);
    expect(sql(client.query)).not.toContain('DELETE FROM entries WHERE plan_id = $1');
    expect(sql(client.query).at(-1)).toBe('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});

describe('the queue', () => {
  test('claiming takes the oldest queued import with SKIP LOCKED, or nothing', async () => {
    expect(await claimNextImport()).toBeNull();
    expect(sql(pool.query)[0]).toMatch(/status = 'queued' OR \(status = 'processing' AND updated_at < now\(\) - interval '10 minutes'\) ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1/);
    pool.query.mockResolvedValueOnce({ rows: [{ id: 3 }] });
    expect(await claimNextImport()).toEqual({ id: 3 });
  });

  test('a status update keeps the draft unless a new one is given', async () => {
    await updateImport(3, 'failed', { error: 'down' });
    expect(pool.query.mock.calls[0][1]).toEqual([3, 'failed', null, 'down']);
    await updateImport(3, 'ready', { draft });
    expect(pool.query.mock.calls[1][1]).toEqual([3, 'ready', JSON.stringify(draft), null]);
    await updateImport(3, 'queued');
    expect(pool.query.mock.calls[2][1]).toEqual([3, 'queued', null, null]);
  });

  test('insert, list and find send their parameters and never return the photo bytes', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1 }] });
    await insertImport(5, { sourceUrl: 'https://a.bg', image: null, imageType: null, instructions: '' }, 'u2');
    expect(pool.query.mock.calls[0][1]).toEqual([5, 'https://a.bg', null, null, '', 'u2']);
    expect(await listImports(5)).toEqual([{ id: 1 }]);
    expect(pool.query.mock.calls[1][1]).toEqual([5]);
    expect(await findImport(1)).toEqual({ id: 1 });
    pool.query.mockResolvedValue({ rows: [] });
    expect(await findImport(2)).toBeNull();
    expect(sql(pool.query).slice(1).every((q) => q.includes('image IS NOT NULL AS "hasImage"'))).toBe(true);
  });
});
