import { beforeEach, describe, expect, test, vi } from 'vitest';
import { POST as messageRoute } from '../../app/api/plans/[id]/messages/route';
import { DELETE as deletePlanRoute } from '../../app/api/plans/[id]/route';
import { POST as shareRoute } from '../../app/api/plans/[id]/shares/route';
import { GET as imageRoute, DELETE as removeSourceRoute } from '../../app/api/plans/[id]/sources/[sourceId]/route';
import { POST as sourceRoute } from '../../app/api/plans/[id]/sources/route';
import { POST as createRoute } from '../../app/api/plans/route';
import { DELETE as unshareRoute } from '../../app/api/plans/[id]/shares/[userId]/route';
import { PATCH as roleRoute } from '../../app/api/users/[id]/route';
import { getActor } from '../../app/session';
import { listEntries } from '../../src/data/entries';
import * as plans from '../../src/data/plans';
import { findUserIdByEmail, setRoleById } from '../../src/data/users';

// Real requests through the plan and role routes; only the session lookup and the data layer are replaced.
vi.mock('../../app/session', async (original) => ({ ...(await original<object>()), getActor: vi.fn() }));
vi.mock('../../src/data/entries', () => ({ listEntries: vi.fn(), entryExists: vi.fn(), deleteEntry: vi.fn() }));
vi.mock('../../src/data/users', () => ({ findUserIdByEmail: vi.fn(), setRoleById: vi.fn(), listUsers: vi.fn() }));
vi.mock('../../src/data/plans');

const ana = { id: 'ana', role: 'student' };
const boris = { id: 'boris', role: 'student' };
const as = (actor: typeof ana | null) => vi.mocked(getActor).mockResolvedValue(actor);
const plan = { id: 1, ownerId: 'ana', ownerEmail: 'ana@test.bg', name: 'План', groupName: '222', windows: [], windowsFrom: 'parser' as const, modelStatus: 'idle' as const };
const req = (method: string, body?: unknown) =>
  new Request('http://localhost:3000/api/x', { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = <T>(value: T) => ({ params: Promise.resolve(value) });
const form = (fields: Record<string, string | Blob>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return new Request('http://localhost:3000/api/x', { method: 'POST', body: data });
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(plans.findPlan).mockResolvedValue(plan);
  vi.mocked(plans.isSharedWith).mockImplementation(async (_id, userId) => userId === 'boris');
  vi.mocked(plans.listSources).mockResolvedValue([]);
  vi.mocked(plans.listMessages).mockResolvedValue([]);
  vi.mocked(listEntries).mockResolvedValue([
    { id: 4, course: 'УП', type: 'lab', day: 1, startsAt: '13:45', endsAt: '16:30', room: '705', startWeek: 3, groups: [{ name: '222', parity: 'odd' }] },
  ]);
});

describe('plans over HTTP', () => {
  test('POST /api/plans creates a plan (201), and refuses a group that does not exist (400) or nobody signed in (401)', async () => {
    as(ana);
    vi.mocked(plans.insertPlan).mockResolvedValue(7);
    const res = await createRoute(req('POST', { name: 'План', group: '222' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 7 });
    expect((await createRoute(req('POST', { name: 'План', group: '999' }))).status).toBe(400);
    as(null);
    expect((await createRoute(req('POST', { name: 'План', group: '222' }))).status).toBe(401);
  });

  test('AC-19 a reader who posts a message or a source gets 403 and nothing is added', async () => {
    as(boris);
    expect((await messageRoute(req('POST', { text: 'здравей' }), params({ id: '1' }))).status).toBe(403);
    expect((await sourceRoute(form({ text: 'Работя от 9 до 17' }), params({ id: '1' }))).status).toBe(403);
    expect(plans.insertMessage).not.toHaveBeenCalled();
    expect(plans.insertSource).not.toHaveBeenCalled();
  });

  test('AC-20 deleting someone else\'s plan gets 403, and signed out 401; the plan stays', async () => {
    as({ id: 'vera', role: 'student' });
    expect((await deletePlanRoute(req('DELETE'), params({ id: '1' }))).status).toBe(403);
    as(null);
    expect((await deletePlanRoute(req('DELETE'), params({ id: '1' }))).status).toBe(401);
    expect(plans.deletePlan).not.toHaveBeenCalled();
  });

  test('the owner adds a text and a photo (201), sends a message (201), shares (201), unshares and deletes (204)', async () => {
    as(ana);
    expect((await sourceRoute(form({ text: 'Работя от 9:00 до 16:30' }), params({ id: '1' }))).status).toBe(201);
    const photo = new File([new Uint8Array([1, 2, 3])], 'rota.png', { type: 'image/png' });
    expect((await sourceRoute(form({ photo }), params({ id: '1' }))).status).toBe(201);
    expect(plans.insertSource).toHaveBeenLastCalledWith(1, { image: Buffer.from([1, 2, 3]), imageType: 'image/png' });
    expect((await messageRoute(req('POST', { text: 'и в събота' }), params({ id: '1' }))).status).toBe(201);
    vi.mocked(findUserIdByEmail).mockResolvedValue('boris');
    expect((await shareRoute(req('POST', { email: 'boris@test.bg' }), params({ id: '1' }))).status).toBe(201);
    expect((await unshareRoute(req('DELETE'), params({ id: '1', userId: 'boris' }))).status).toBe(204);
    vi.mocked(plans.deleteSource).mockResolvedValue(true);
    expect((await removeSourceRoute(req('DELETE'), params({ id: '1', sourceId: '1' }))).status).toBe(204);
    expect((await deletePlanRoute(req('DELETE'), params({ id: '1' }))).status).toBe(204);
  });

  test('a photo is served to a reader with its type, and a missing one is 404', async () => {
    as(boris);
    vi.mocked(plans.findSourceImage).mockResolvedValue({ data: Buffer.from([1, 2]), type: 'image/png' });
    const res = await imageRoute(req('GET'), params({ id: '1', sourceId: '2' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    vi.mocked(plans.findSourceImage).mockResolvedValue(null);
    expect((await imageRoute(req('GET'), params({ id: '1', sourceId: '3' }))).status).toBe(404);
  });

  test('a source upload from nobody signed in is refused with 401 before the upload is read', async () => {
    as(null);
    expect((await sourceRoute(form({ text: 'x' }), params({ id: '1' }))).status).toBe(401);
  });
});

describe('PATCH /api/users/:id', () => {
  test('AC-21 an admin changes a role (204); a publisher gets 403 and nothing changes', async () => {
    as({ id: 'a1', role: 'admin' });
    vi.mocked(setRoleById).mockResolvedValue(true);
    expect((await roleRoute(req('PATCH', { role: 'publisher' }), params({ id: 's1' }))).status).toBe(204);
    vi.mocked(setRoleById).mockClear();
    as({ id: 'p1', role: 'publisher' });
    expect((await roleRoute(req('PATCH', { role: 'admin' }), params({ id: 'p1' }))).status).toBe(403);
    expect(setRoleById).not.toHaveBeenCalled();
  });
});
