import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DELETE as deleteEntryRoute } from '../../app/api/entries/[id]/route';
import { POST as publishRoute } from '../../app/api/imports/[id]/publish/route';
import { POST as importRoute } from '../../app/api/imports/route';
import { POST as noteRoute } from '../../app/api/notes/route';
import { getActor } from '../../app/session';
import { deleteEntry, entryExists, listEntries } from '../../src/data/entries';
import { findImport, insertImport, publishDraft, type Import } from '../../src/data/imports';
import { insertNote } from '../../src/data/notes';

// The API tests: real Request objects through the real route handlers, services and error
// handling. Only who is signed in (the session lookup) and the data layer are replaced.
vi.mock('../../app/session', async (original) => ({ ...(await original<object>()), getActor: vi.fn() }));
vi.mock('../../src/data/entries', () => ({ listEntries: vi.fn(), entryExists: vi.fn(), deleteEntry: vi.fn() }));
vi.mock('../../src/data/notes', () => ({ listNotes: vi.fn(), insertNote: vi.fn() }));
vi.mock('../../src/data/imports', () => ({
  insertImport: vi.fn(),
  listImports: vi.fn(),
  findImport: vi.fn(),
  claimNextImport: vi.fn(),
  updateImport: vi.fn(),
  publishDraft: vi.fn(),
}));

const student = { id: 'u1', role: 'student' };
const publisher = { id: 'u2', role: 'publisher' };
const signedInAs = (actor: typeof student | null) => vi.mocked(getActor).mockResolvedValue(actor);

const json = (url: string, method: string, body?: unknown) =>
  new Request(`http://localhost:3000${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return new Request('http://localhost:3000/api/imports', { method: 'POST', body: data });
};
const params = <T>(value: T) => ({ params: Promise.resolve(value) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listEntries).mockResolvedValue([
    { id: 18, course: 'КЗ', type: 'lab', day: 6, startsAt: '10:30', endsAt: '13:15', room: '1211', startWeek: 4, groups: [{ name: '222', parity: 'even' }] },
  ]);
});

describe('POST /api/imports', () => {
  test('AC-10 a student who sends POST /api/imports gets 403 and no row is added to imports', async () => {
    signedInAs(student);
    const res = await importRoute(form({ url: 'https://cs.fcst.bg/page.php?id=89' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Само публикуващ може да внася разписания.' });
    expect(insertImport).not.toHaveBeenCalled();
  });

  test('nobody signed in gets 401', async () => {
    signedInAs(null);
    expect((await importRoute(form({ url: 'https://cs.fcst.bg/page.php?id=89' }))).status).toBe(401);
    expect(insertImport).not.toHaveBeenCalled();
  });

  test('AC-3 a publisher gets 201 and the import is "queued"', async () => {
    signedInAs(publisher);
    vi.mocked(insertImport).mockResolvedValue({ id: 9, status: 'queued' } as Import);
    const res = await importRoute(form({ url: 'https://cs.fcst.bg/page.php?id=89' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 9, status: 'queued' });
  });

  test('a publisher who sends neither a page nor a photo gets 400', async () => {
    signedInAs(publisher);
    expect((await importRoute(form({}))).status).toBe(400);
  });
});

describe('POST /api/imports/:id/publish', () => {
  test('AC-5 publishing a draft with a class outside the 14 periods is refused with 400 and nothing is published', async () => {
    signedInAs(publisher);
    const draft = [{ course: 'КЗ', type: 'lab', day: 6, startsAt: '08:00', endsAt: '10:15', room: '1211', startWeek: 4, groups: [{ name: '222', parity: 'even' as const }] }];
    vi.mocked(findImport).mockResolvedValue({ id: 3, status: 'ready', draft } as Import);
    const res = await publishRoute(json('/api/imports/3/publish', 'POST'), params({ id: '3' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('невалидните занятия');
    expect(publishDraft).not.toHaveBeenCalled();
  });
});

describe('POST /api/notes', () => {
  const note = { entryId: 18, week: 6, text: 'Отменено' };

  test('AC-7 a publisher adds a note and gets 201', async () => {
    signedInAs(publisher);
    vi.mocked(entryExists).mockResolvedValue(true);
    vi.mocked(insertNote).mockResolvedValue({ id: 1, entryId: 18, week: 6, text: 'Отменено' });
    const res = await noteRoute(json('/api/notes', 'POST', note));
    expect(res.status).toBe(201);
    expect(insertNote).toHaveBeenCalledWith(18, 6, 'Отменено', 'u2');
  });

  test('a student gets 403 and nobody signed in gets 401; no note is added', async () => {
    signedInAs(student);
    expect((await noteRoute(json('/api/notes', 'POST', note))).status).toBe(403);
    signedInAs(null);
    expect((await noteRoute(json('/api/notes', 'POST', note))).status).toBe(401);
    expect(insertNote).not.toHaveBeenCalled();
  });

  test('an empty note gets 400, and a body that is not JSON gets a readable 4xx, not 500', async () => {
    signedInAs(publisher);
    expect((await noteRoute(json('/api/notes', 'POST', { ...note, text: ' ' }))).status).toBe(400);
    const broken = new Request('http://localhost:3000/api/notes', { method: 'POST', body: 'null' });
    const res = await noteRoute(broken);
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty('error');
  });
});

describe('DELETE /api/entries/:id', () => {
  test('AC-18 a student gets 403, nobody signed in gets 401, and nothing is removed', async () => {
    signedInAs(student);
    expect((await deleteEntryRoute(json('/api/entries/18', 'DELETE'), params({ id: '18' }))).status).toBe(403);
    signedInAs(null);
    expect((await deleteEntryRoute(json('/api/entries/18', 'DELETE'), params({ id: '18' }))).status).toBe(401);
    expect(deleteEntry).not.toHaveBeenCalled();
  });

  test('AC-18 a publisher gets 204', async () => {
    signedInAs(publisher);
    vi.mocked(deleteEntry).mockResolvedValue(true);
    expect((await deleteEntryRoute(json('/api/entries/18', 'DELETE'), params({ id: '18' }))).status).toBe(204);
  });

  test('an unexpected failure is a 500 with a readable sentence and no details', async () => {
    signedInAs(publisher);
    vi.mocked(deleteEntry).mockRejectedValue(new Error('connection refused'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await deleteEntryRoute(json('/api/entries/18', 'DELETE'), params({ id: '18' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Нещо се обърка. Опитайте отново.' });
  });
});
