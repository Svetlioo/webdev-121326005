import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { listEntries, type Entry, type Parity } from '../../src/data/entries';
import { listNotes } from '../../src/data/notes';
import * as data from '../../src/data/plans';
import type { Plan } from '../../src/data/plans';
import { findUserIdByEmail } from '../../src/data/users';
import { ModelTimeoutError, type ModelClient } from '../../src/model/client';
import {
  addSource,
  createPlan,
  deletePlan,
  getPlan,
  getSourceImage,
  listMyPlans,
  processNextPlan,
  removeSource,
  sendMessage,
  sharePlan,
  unsharePlan,
} from '../../src/services/plans';

// The data layer is replaced by a small in-memory store and the seeded schedule, so these tests
// check the rules (who may read, who may change) and what ends up stored.
vi.mock('../../src/data/entries', () => ({ listEntries: vi.fn(), entryExists: vi.fn(), deleteEntry: vi.fn() }));
vi.mock('../../src/data/notes', () => ({ listNotes: vi.fn(), insertNote: vi.fn() }));
vi.mock('../../src/data/users', () => ({ findUserIdByEmail: vi.fn() }));
vi.mock('../../src/data/plans');

type SeedEntry = Omit<Entry, 'id' | 'groups'> & { groups: [string, Parity][] };
const seed: SeedEntry[] = JSON.parse(readFileSync('db/seed/fkst-ksi-mag-2026-winter.json', 'utf8')).entries;
const entries: Entry[] = seed.map((e, i) => ({ ...e, id: i + 1, groups: e.groups.map(([name, parity]) => ({ name, parity })) }));

const ana = { id: 'ana', role: 'student' };
const boris = { id: 'boris', role: 'student' };
const vera = { id: 'vera', role: 'student' };

// The store behind the mocked data layer.
let plans: Plan[];
let sources: { id: number; planId: number; text: string | null; image?: Buffer; imageType: string | null }[];
let messages: { id: number; planId: number; role: 'user' | 'assistant'; content: string }[];
let shares: { planId: number; userId: string }[];

beforeEach(() => {
  vi.resetAllMocks();
  plans = [];
  sources = [];
  messages = [];
  shares = [];
  vi.mocked(listEntries).mockImplementation(async () => structuredClone(entries));
  vi.mocked(listNotes).mockResolvedValue([]);
  vi.mocked(findUserIdByEmail).mockImplementation(async (email) => ({ 'boris@test.bg': 'boris', 'ana@test.bg': 'ana' })[email] ?? null);
  const plan = (id: number) => plans.find((p) => p.id === id)!;
  vi.mocked(data.insertPlan).mockImplementation(async (ownerId, name, groupName) => {
    plans.push({ id: plans.length + 1, ownerId, ownerEmail: `${ownerId}@test.bg`, name, groupName, windows: [], windowsFrom: 'parser', modelStatus: 'idle' });
    return plans.length;
  });
  vi.mocked(data.findPlan).mockImplementation(async (id) => structuredClone(plans.find((p) => p.id === id) ?? null));
  vi.mocked(data.listPlansFor).mockImplementation(async (userId) => ({
    own: plans.filter((p) => p.ownerId === userId),
    shared: plans.filter((p) => shares.some((s) => s.planId === p.id && s.userId === userId)),
  }));
  vi.mocked(data.isSharedWith).mockImplementation(async (planId, userId) => shares.some((s) => s.planId === planId && s.userId === userId));
  vi.mocked(data.deletePlan).mockImplementation(async (id) => void (plans = plans.filter((p) => p.id !== id)));
  vi.mocked(data.saveWindows).mockImplementation(async (id, windows, from, status) => {
    Object.assign(plan(id), { windows, windowsFrom: from, modelStatus: status });
  });
  vi.mocked(data.setModelStatus).mockImplementation(async (id, status) => void (plan(id).modelStatus = status));
  vi.mocked(data.claimNextPlan).mockImplementation(async () => {
    const next = plans.find((p) => p.modelStatus === 'queued');
    if (next) next.modelStatus = 'processing';
    return next?.id ?? null;
  });
  vi.mocked(data.listSources).mockImplementation(async (planId) =>
    sources.filter((s) => s.planId === planId).map(({ id, text, imageType }) => ({ id, text, imageType })),
  );
  vi.mocked(data.listSourceImages).mockImplementation(async (planId) =>
    sources.filter((s) => s.planId === planId && s.image).map((s) => ({ data: s.image!, type: s.imageType! })),
  );
  vi.mocked(data.findSourceImage).mockImplementation(async (planId, id) => {
    const s = sources.find((x) => x.planId === planId && x.id === id && x.image);
    return s ? { data: s.image!, type: s.imageType! } : null;
  });
  vi.mocked(data.insertSource).mockImplementation(async (planId, s) => {
    sources.push('text' in s ? { id: sources.length + 1, planId, text: s.text, imageType: null } : { id: sources.length + 1, planId, text: null, image: s.image, imageType: s.imageType });
  });
  vi.mocked(data.deleteSource).mockImplementation(async (planId, id) => {
    const before = sources.length;
    sources = sources.filter((s) => !(s.planId === planId && s.id === id));
    return sources.length < before;
  });
  vi.mocked(data.listMessages).mockImplementation(async (planId) =>
    messages.filter((m) => m.planId === planId).map(({ id, role, content }) => ({ id, role, content })),
  );
  vi.mocked(data.insertMessage).mockImplementation(async (planId, role, content) => void messages.push({ id: messages.length + 1, planId, role, content }));
  vi.mocked(data.listShares).mockImplementation(async (planId) =>
    shares.filter((s) => s.planId === planId).map((s) => ({ userId: s.userId, email: `${s.userId}@test.bg` })),
  );
  vi.mocked(data.addShare).mockImplementation(async (planId, userId) => void shares.push({ planId, userId }));
  vi.mocked(data.removeShare).mockImplementation(async (planId, userId) => void (shares = shares.filter((s) => !(s.planId === planId && s.userId === userId))));
});

const WORK = 'Работя от 9:00 до 16:30 в делничните дни';
const label = (view: Awaited<ReturnType<typeof getPlan>>, course: string, day: number, startsAt: string) =>
  view.classes.find((c) => c.course === course && c.day === day && c.startsAt === startsAt)?.label;

describe('my plan', () => {
  test('AC-8 with "Работя от 9:00 до 16:30 в делничните дни", the Monday КЗ lecture and the Saturday КЗ lab can be attended, and no weekday class between 9:00 and 16:30', async () => {
    const id = await createPlan(ana, { name: 'Зимен семестър', group: '222' });
    await addSource(ana, id, { text: WORK });
    const view = await getPlan(ana, id, 4);
    expect(label(view, 'КЗ', 1, '16:45')).toBe('can_attend');
    expect(label(view, 'КЗ', 6, '10:30')).toBe('can_attend');
    const weekdayInWork = view.classes.filter((c) => c.day <= 5 && c.startsAt < '16:30' && c.endsAt > '09:00');
    expect(weekdayInWork.length).toBeGreaterThan(0);
    expect(weekdayInWork.every((c) => c.label !== 'can_attend')).toBe(true);
  });

  test('AC-9 with no model, the labels are there at once, computed without the model, and the plan waits for the worker', async () => {
    const id = await createPlan(ana, { name: 'План', group: '222' });
    await addSource(ana, id, { text: WORK });
    const view = await getPlan(ana, id, 4);
    expect(view.plan).toMatchObject({ windowsFrom: 'parser', modelStatus: 'queued' });
    expect(view.plan.windows).toHaveLength(5);
    // The worker with no model leaves the parser's windows and marks the plan failed.
    const noModel: ModelClient = { readSchedule: vi.fn(), readPlan: vi.fn(async () => Promise.reject(new ModelTimeoutError('t'))) };
    await processNextPlan(noModel);
    const after = await getPlan(ana, id, 4);
    expect(after.plan).toMatchObject({ windowsFrom: 'parser', modelStatus: 'failed' });
    expect(label(after, 'КЗ', 1, '16:45')).toBe('can_attend');
  });

  test('the model reads the windows (structured output) and replies in the chat; the server still labels the classes', async () => {
    const id = await createPlan(ana, { name: 'План', group: '222' });
    await sendMessage(ana, id, 'В понеделник съм на работа цял ден');
    const model: ModelClient = {
      readSchedule: vi.fn(),
      readPlan: vi.fn(async () => ({ reply: 'Разбрах: понеделник сте на работа.', windows: [{ day: 1, from: '07:00', to: '20:00', what: 'работа' }] })),
    };
    expect(await processNextPlan(model)).toBe(id);
    expect(model.readPlan).toHaveBeenCalledWith({ instructions: [], images: [], messages: [{ role: 'user', content: 'В понеделник съм на работа цял ден' }] });
    const view = await getPlan(ana, id, 3);
    expect(view.plan).toMatchObject({ windowsFrom: 'model', modelStatus: 'idle' });
    expect(view.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'Разбрах: понеделник сте на работа.' });
    expect(label(view, 'УП', 1, '13:45')).toBe('time_off');
    expect(label(view, 'КЗ', 1, '16:45')).toBe('email');
    expect(await processNextPlan(model)).toBeNull();
  });

  test('the model gets the instructions and the photos of the plan', async () => {
    const id = await createPlan(ana, { name: 'План', group: '222' });
    await addSource(ana, id, { text: WORK });
    await addSource(ana, id, { image: Buffer.from('png'), imageType: 'image/png' });
    const model: ModelClient = { readSchedule: vi.fn(), readPlan: vi.fn(async () => ({ reply: 'ok', windows: [] })) };
    await processNextPlan(model);
    expect(model.readPlan).toHaveBeenCalledWith({ instructions: [WORK], images: [{ data: Buffer.from('png'), type: 'image/png' }], messages: [] });
  });

  test('AC-22 an answer that does not match the schema is rejected and the windows without the model stay', async () => {
    const id = await createPlan(ana, { name: 'План', group: '222' });
    await addSource(ana, id, { text: WORK });
    const wrong: ModelClient = { readSchedule: vi.fn(), readPlan: vi.fn(async () => ({ reply: 'ok', windows: [{ day: 9, from: '25:00', to: '26:00', what: 'x' }] })) };
    await processNextPlan(wrong);
    const view = await getPlan(ana, id, 4);
    expect(view.plan).toMatchObject({ windowsFrom: 'parser', modelStatus: 'failed' });
    expect(view.plan.windows).toHaveLength(5);
    expect(view.messages).toEqual([]);
  });

  test('a cancelled class gets no label', async () => {
    vi.mocked(listNotes).mockResolvedValue([{ id: 1, entryId: 18, week: 4, text: 'Отменено' }]);
    const id = await createPlan(ana, { name: 'План', group: '222' });
    expect((await getPlan(ana, id, 4)).classes.find((c) => c.id === 18)).toMatchObject({ label: null, cancelled: true });
  });

  test('a photo is a source the model gets; it can be read back and removed', async () => {
    const id = await createPlan(ana, { name: 'План', group: '222' });
    await addSource(ana, id, { image: Buffer.from('png'), imageType: 'image/png' });
    expect(await getSourceImage(ana, id, 1)).toEqual({ data: Buffer.from('png'), type: 'image/png' });
    await removeSource(ana, id, 1);
    await expect(getSourceImage(ana, id, 1)).rejects.toMatchObject({ status: 404 });
    await expect(removeSource(ana, id, 1)).rejects.toMatchObject({ status: 404 });
  });

  test.each([
    ['nothing', {}],
    ['both a text and a photo', { text: 'x', image: Buffer.from('p'), imageType: 'image/png' }],
    ['a text over 1000 characters', { text: 'x'.repeat(1001) }],
    ['a file that is not an image', { image: Buffer.from('p'), imageType: 'application/pdf' }],
    ['a photo with no type', { image: Buffer.from('p') }],
    ['a photo over 10 MB', { image: Buffer.alloc(10 * 1024 * 1024 + 1), imageType: 'image/png' }],
  ])('a source with %s gives 400', async (_name, input) => {
    const id = await createPlan(ana, { name: 'План', group: '222' });
    await expect(addSource(ana, id, input)).rejects.toMatchObject({ status: 400 });
    expect(sources).toHaveLength(0);
  });

  test.each([
    ['an empty name', { name: ' ', group: '222' }],
    ['a group that is not in the schedule', { name: 'План', group: '999' }],
  ])('a plan with %s gives 400', async (_name, input) => {
    await expect(createPlan(ana, input)).rejects.toMatchObject({ status: 400 });
  });

  test('an empty chat message gives 400', async () => {
    const id = await createPlan(ana, { name: 'План', group: '222' });
    await expect(sendMessage(ana, id, '  ')).rejects.toMatchObject({ status: 400 });
  });
});

describe('sharing', () => {
  test('AC-19 a plan shared with Boris shows under his shared plans; he can read it, and adding a source or a message gets 403', async () => {
    const id = await createPlan(ana, { name: 'План', group: '222' });
    await sharePlan(ana, id, 'boris@test.bg');
    expect((await listMyPlans(boris)).shared.map((p) => p.id)).toEqual([id]);
    const view = await getPlan(boris, id, 3);
    expect(view).toMatchObject({ isOwner: false, shares: [] });
    await expect(addSource(boris, id, { text: WORK })).rejects.toMatchObject({ status: 403 });
    await expect(sendMessage(boris, id, 'здравей')).rejects.toMatchObject({ status: 403 });
    expect(sources).toHaveLength(0);
    expect(messages).toHaveLength(0);
  });

  test('AC-20 someone the plan is not shared with gets 403 for reading, changing and deleting it; nobody signed in gets 401', async () => {
    const id = await createPlan(ana, { name: 'План', group: '222' });
    await expect(getPlan(vera, id, 3)).rejects.toMatchObject({ status: 403 });
    await expect(addSource(vera, id, { text: WORK })).rejects.toMatchObject({ status: 403 });
    await expect(deletePlan(vera, id)).rejects.toMatchObject({ status: 403 });
    await expect(getPlan(null, id, 3)).rejects.toMatchObject({ status: 401 });
    expect(plans).toHaveLength(1);
  });

  test('a reader cannot share, unshare or delete; the owner can unshare and delete', async () => {
    const id = await createPlan(ana, { name: 'План', group: '222' });
    await sharePlan(ana, id, 'boris@test.bg');
    await expect(sharePlan(boris, id, 'ana@test.bg')).rejects.toMatchObject({ status: 403 });
    await expect(deletePlan(boris, id)).rejects.toMatchObject({ status: 403 });
    expect((await getPlan(ana, id, 3)).shares).toEqual([{ userId: 'boris', email: 'boris@test.bg' }]);
    await unsharePlan(ana, id, 'boris');
    await expect(getPlan(boris, id, 3)).rejects.toMatchObject({ status: 403 });
    await expect(unsharePlan(boris, id, 'boris')).rejects.toMatchObject({ status: 403 });
    await deletePlan(ana, id);
    expect(plans).toHaveLength(0);
  });

  test('sharing with an unknown email gives 404, and with yourself 400', async () => {
    const id = await createPlan(ana, { name: 'План', group: '222' });
    await expect(sharePlan(ana, id, 'nobody@test.bg')).rejects.toMatchObject({ status: 404 });
    await expect(sharePlan(ana, id, 'ana@test.bg')).rejects.toMatchObject({ status: 400 });
  });

  test.each([999, NaN])('plan %s that does not exist gives 404', async (id) => {
    await expect(getPlan(ana, id, 3)).rejects.toMatchObject({ status: 404 });
  });

  test('a photo id that is not a number gives 404', async () => {
    const id = await createPlan(ana, { name: 'План', group: '222' });
    await expect(getSourceImage(ana, id, NaN)).rejects.toMatchObject({ status: 404 });
    await expect(removeSource(ana, id, NaN)).rejects.toMatchObject({ status: 404 });
  });
});
