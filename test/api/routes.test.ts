import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DELETE as deleteEntryRoute } from '../../app/api/entries/[id]/route';
import { POST as publishRoute } from '../../app/api/imports/[id]/publish/route';
import { POST as noteRoute } from '../../app/api/notes/route';
import { POST as importRoute } from '../../app/api/plans/[id]/imports/route';
import { getActor } from '../../app/session';
import * as entries from '../../src/data/entries';
import { findImport, insertImport, publishDraft, type Import } from '../../src/data/imports';
import { createPlan, sharePlan } from '../../src/services/plans';
import { ana, boris, installFakes, vera, type Store } from '../fakes';

// The API tests: real Request objects through the real route handlers, services and error
// handling. Only who is signed in (the session lookup) and the data layer are replaced.
vi.mock('../../app/session', async (original) => ({ ...(await original<object>()), getActor: vi.fn() }));
vi.mock('../../src/data/entries');
vi.mock('../../src/data/notes');
vi.mock('../../src/data/plans');
vi.mock('../../src/data/users');
vi.mock('../../src/data/imports');

const signedInAs = (actor: typeof ana | null) => vi.mocked(getActor).mockResolvedValue(actor);
const json = (method: string, body?: unknown) =>
  new Request('http://localhost:3000/api/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return new Request('http://localhost:3000/api/x', { method: 'POST', body: data });
};
const params = <T>(value: T) => ({ params: Promise.resolve(value) });

let db: Store;
let planId: number;
let lab: number;
beforeEach(async () => {
  vi.resetAllMocks();
  db = installFakes();
  planId = await createPlan(ana, { name: 'Зима', myGroup: '222', fromSample: true });
  await sharePlan(ana, planId, 'boris@test.bg');
  lab = db.entries.find((e) => e.course === 'КЗ' && e.day === 6 && e.startsAt === '10:30')!.id;
});

describe('POST /api/plans/:id/imports', () => {
  test('AC-10 a student who sends POST /api/plans/:id/imports for a plan that is not theirs gets 403 and no row is added to imports', async () => {
    signedInAs(vera);
    const res = await importRoute(form({ url: 'https://cs.fcst.bg/page.php?id=89' }), params({ id: String(planId) }));
    expect(res.status).toBe(403);
    expect(await res.json()).toHaveProperty('error');
    expect(insertImport).not.toHaveBeenCalled();
  });

  test('a reader of the plan also gets 403, and nobody signed in 401', async () => {
    signedInAs(boris);
    expect((await importRoute(form({ url: 'https://cs.fcst.bg' }), params({ id: String(planId) }))).status).toBe(403);
    signedInAs(null);
    expect((await importRoute(form({ url: 'https://cs.fcst.bg' }), params({ id: String(planId) }))).status).toBe(401);
    expect(insertImport).not.toHaveBeenCalled();
  });

  test('AC-3 the owner gets 201 and the import is "queued"', async () => {
    signedInAs(ana);
    vi.mocked(insertImport).mockResolvedValue({ id: 9, status: 'queued' } as Import);
    const res = await importRoute(form({ url: 'https://cs.fcst.bg/page.php?id=89' }), params({ id: String(planId) }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 9, status: 'queued' });
  });

  test('the owner who sends neither a page nor a photo gets 400', async () => {
    signedInAs(ana);
    expect((await importRoute(form({}), params({ id: String(planId) }))).status).toBe(400);
  });
});

describe('R2 upload size', () => {
  test('R2 a body over 11 MB is refused with 413 before it is read, for imports and for sources', async () => {
    signedInAs(ana);
    const big = (url: string) => new Request(url, { method: 'POST', headers: { 'content-length': String(12 * 1024 * 1024) }, body: 'x' });
    const imp = await importRoute(big('http://localhost:3000/api/x'), params({ id: String(planId) }));
    expect(imp.status).toBe(413);
    expect(await imp.json()).toHaveProperty('error');
    const { POST: sourceRoute } = await import('../../app/api/plans/[id]/sources/route');
    expect((await sourceRoute(big('http://localhost:3000/api/x'), params({ id: String(planId) }))).status).toBe(413);
    expect(insertImport).not.toHaveBeenCalled();
  });
});

describe('POST /api/imports/:id/publish', () => {
  test('AC-5 publishing a draft with a class outside the 14 periods is refused with 400 and nothing is published', async () => {
    signedInAs(ana);
    const draft = [{ course: 'КЗ', type: 'lab', day: 6, startsAt: '08:00', endsAt: '10:15', room: '1211', startWeek: 4, groups: [{ name: '222', parity: 'even' as const }] }];
    vi.mocked(findImport).mockResolvedValue({ id: 3, planId, status: 'ready', draft } as Import);
    const res = await publishRoute(json('POST'), params({ id: '3' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('невалидните занятия');
    expect(publishDraft).not.toHaveBeenCalled();
  });
});

describe('POST /api/notes', () => {
  test('AC-7 the owner adds a note and gets 201', async () => {
    signedInAs(ana);
    const res = await noteRoute(json('POST', { entryId: lab, week: 6, text: 'Отменено' }));
    expect(res.status).toBe(201);
    expect(db.notes).toMatchObject([{ entryId: lab, week: 6, text: 'Отменено' }]);
  });

  test('a reader gets 403 and nobody signed in gets 401; no note is added', async () => {
    signedInAs(boris);
    expect((await noteRoute(json('POST', { entryId: lab, week: 6, text: 'Отменено' }))).status).toBe(403);
    signedInAs(null);
    expect((await noteRoute(json('POST', { entryId: lab, week: 6, text: 'Отменено' }))).status).toBe(401);
    expect(db.notes).toHaveLength(0);
  });

  test('an empty note gets 400, and a body that is not JSON gets a readable 4xx, not 500', async () => {
    signedInAs(ana);
    expect((await noteRoute(json('POST', { entryId: lab, week: 6, text: ' ' }))).status).toBe(400);
    const res = await noteRoute(new Request('http://localhost:3000/api/notes', { method: 'POST', body: 'null' }));
    expect(res.status).toBe(404);
    expect(await res.json()).toHaveProperty('error');
  });
});

describe('DELETE /api/entries/:id', () => {
  test('AC-18 a reader gets 403, nobody signed in gets 401, and nothing is removed; the owner gets 204', async () => {
    signedInAs(boris);
    expect((await deleteEntryRoute(json('DELETE'), params({ id: String(lab) }))).status).toBe(403);
    signedInAs(null);
    expect((await deleteEntryRoute(json('DELETE'), params({ id: String(lab) }))).status).toBe(401);
    expect(db.entries.some((e) => e.id === lab)).toBe(true);
    signedInAs(ana);
    expect((await deleteEntryRoute(json('DELETE'), params({ id: String(lab) }))).status).toBe(204);
    expect(db.entries.some((e) => e.id === lab)).toBe(false);
  });

  test('an unexpected failure is a 500 with a readable sentence and no details', async () => {
    signedInAs(ana);
    vi.mocked(entries.deleteEntry).mockRejectedValue(new Error('connection refused'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await deleteEntryRoute(json('DELETE'), params({ id: String(lab) }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Нещо се обърка. Опитайте отново.' });
  });
});
