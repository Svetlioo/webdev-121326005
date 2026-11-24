import { beforeEach, describe, expect, test, vi } from 'vitest';
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
import { addNote } from '../../src/services/schedule';
import { admin, ana, boris, installFakes, vera, type Store } from '../fakes';

// The data layer is an in-memory store (test/fakes.ts), so these tests check the rules
// (who may read, who may change) and what ends up stored.
vi.mock('../../src/data/entries');
vi.mock('../../src/data/notes');
vi.mock('../../src/data/plans');
vi.mock('../../src/data/users');

let db: Store;
beforeEach(() => {
  vi.resetAllMocks();
  db = installFakes();
});

const WORK = 'Работя от 9:00 до 16:30 в делничните дни';
const newPlan = () => createPlan(ana, { name: 'Зимен семестър', myGroup: '222', fromSample: true });
const label = (view: Awaited<ReturnType<typeof getPlan>>, course: string, day: number, startsAt: string) =>
  view.classes.find((c) => c.course === course && c.day === day && c.startsAt === startsAt)?.label;
const model = (answer: () => Promise<unknown>): ModelClient => ({ readSchedule: vi.fn(), readPlan: vi.fn(answer) });

describe('my plan', () => {
  test('AC-8 with "Работя от 9:00 до 16:30 в делничните дни", the Monday КЗ lecture and the Saturday КЗ lab can be attended, and no weekday class between 9:00 and 16:30', async () => {
    const id = await newPlan();
    await addSource(ana, id, { text: WORK });
    const view = await getPlan(ana, id, 4);
    expect(label(view, 'КЗ', 1, '16:45')).toBe('can_attend');
    expect(label(view, 'КЗ', 6, '10:30')).toBe('can_attend');
    const weekdayInWork = view.classes.filter((c) => c.day <= 5 && c.startsAt < '16:30' && c.endsAt > '09:00');
    expect(weekdayInWork.length).toBeGreaterThan(0);
    expect(weekdayInWork.every((c) => c.label !== 'can_attend')).toBe(true);
    expect(label(view, 'МСКМ', 2, '10:30')).toBe('email');
  });

  test('AC-9 with no model, the labels are there at once, computed without the model, and the plan waits for the worker', async () => {
    const id = await newPlan();
    await addSource(ana, id, { text: WORK });
    const view = await getPlan(ana, id, 4);
    expect(view.plan).toMatchObject({ windowsFrom: 'parser', modelStatus: 'queued' });
    expect(view.plan.windows).toHaveLength(5);
    await processNextPlan(model(async () => Promise.reject(new ModelTimeoutError('t'))));
    const after = await getPlan(ana, id, 4);
    expect(after.plan).toMatchObject({ windowsFrom: 'parser', modelStatus: 'failed' });
    expect(label(after, 'КЗ', 1, '16:45')).toBe('can_attend');
  });

  test('the model reads the windows (structured output) and replies in the chat; the server still labels the classes', async () => {
    const id = await newPlan();
    await sendMessage(ana, id, 'В понеделник съм на работа цял ден');
    const m = model(async () => ({ reply: 'Разбрах: понеделник сте на работа.', windows: [{ day: 1, from: '07:00', to: '20:00', what: 'работа' }] }));
    expect(await processNextPlan(m)).toBe(id);
    expect(m.readPlan).toHaveBeenCalledWith(expect.objectContaining({ instructions: [], images: [], messages: [{ role: 'user', content: 'В понеделник съм на работа цял ден' }], myGroup: '222' }));
    const view = await getPlan(ana, id, 3);
    expect(view.plan).toMatchObject({ windowsFrom: 'model', modelStatus: 'idle' });
    expect(view.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'Разбрах: понеделник сте на работа.' });
    expect(label(view, 'УП', 1, '13:45')).toBe('time_off');
    expect(label(view, 'КЗ', 1, '16:45')).toBe('email');
    expect(await processNextPlan(m)).toBeNull();
  });

  test('the model gets the instructions and the photos of the plan', async () => {
    const id = await newPlan();
    await addSource(ana, id, { text: WORK });
    await addSource(ana, id, { image: Buffer.from('png'), imageType: 'image/png' });
    const m = model(async () => ({ reply: 'ok', windows: [] }));
    await processNextPlan(m);
    const sent = vi.mocked(m.readPlan).mock.calls[0][0];
    expect(sent).toMatchObject({ instructions: [WORK], images: [{ data: Buffer.from('png'), type: 'image/png' }], messages: [], myGroup: '222' });
    expect(sent.subjects).toContainEqual({ course: 'УП', type: 'lab', groups: ['221а', '221б', '222'], chosen: '222' });
  });

  test('a change made while the model works is not overwritten by the older answer', async () => {
    const id = await newPlan();
    await addSource(ana, id, { text: WORK });
    const m = model(async () => {
      await addSource(ana, id, { text: 'В събота работя от 8 до 12 ч.' }); // the owner adds something meanwhile
      return { reply: 'стар отговор', windows: [] };
    });
    await processNextPlan(m);
    const view = await getPlan(ana, id, 4);
    expect(view.plan).toMatchObject({ windowsFrom: 'parser', modelStatus: 'queued' });
    expect(view.plan.windows).toHaveLength(6);
    expect(view.messages).toEqual([]);
  });

  test('AC-23 the chat replaces the instructions (Friday freed) and moves a subject; an impossible subject change rejects the whole answer', async () => {
    const id = await newPlan();
    await addSource(ana, id, { text: WORK });
    await sendMessage(ana, id, 'Вече не работя в петък');
    await processNextPlan(model(async () => ({
      reply: 'Махнах петък и преместих УП упражнението при 221а.',
      windows: [1, 2, 3, 4].map((day) => ({ day, from: '09:00', to: '16:30', what: 'работа' })),
      instructions: ['Работя от 9:00 до 16:30 от понеделник до четвъртък'],
      subjects: [{ course: 'УП', type: 'lab', group: '221а' }],
    })));
    const view = await getPlan(ana, id, 3);
    expect(view.sources.map((s) => s.text)).toEqual(['Работя от 9:00 до 16:30 от понеделник до четвъртък']);
    expect(label(view, 'МСВИВИ', 5, '07:30')).toBe('can_attend');
    expect(view.subjects.find((s) => s.key === 'УП|lab')).toMatchObject({ chosen: '221а', byDefault: false });
    expect(view.messages.at(-1)).toMatchObject({ role: 'assistant' });

    await sendMessage(ana, id, 'И МСВИВИ с 221б');
    await processNextPlan(model(async () => ({ reply: 'ok', windows: [], instructions: ['нищо'], subjects: [{ course: 'МСВИВИ', type: 'lecture', group: '221б' }] })));
    const after = await getPlan(ana, id, 3);
    expect(after.plan.modelStatus).toBe('failed');
    expect(after.sources.map((s) => s.text)).toEqual(['Работя от 9:00 до 16:30 от понеделник до четвъртък']);
    expect(after.subjects.find((s) => s.key === 'МСВИВИ|lecture')).toMatchObject({ chosen: '222', byDefault: true });
  });

  test('AC-22 an answer that does not match the schema is rejected and the windows without the model stay', async () => {
    const id = await newPlan();
    await addSource(ana, id, { text: WORK });
    await processNextPlan(model(async () => ({ reply: 'ok', windows: [{ day: 9, from: '25:00', to: '26:00', what: 'x' }] })));
    const view = await getPlan(ana, id, 4);
    expect(view.plan).toMatchObject({ windowsFrom: 'parser', modelStatus: 'failed' });
    expect(view.plan.windows).toHaveLength(5);
    expect(view.messages).toEqual([]);
  });

  test('a cancelled class gets no label', async () => {
    const id = await newPlan();
    const lab = db.entries.find((e) => e.course === 'КЗ' && e.day === 6 && e.startsAt === '10:30')!.id;
    await addNote(ana, { entryId: lab, week: 4, text: 'Отменено' });
    expect((await getPlan(ana, id, 4)).classes.find((c) => c.id === lab)).toMatchObject({ label: null, cancelled: true });
  });

  test('R2 a plan keeps at most 5 photos', async () => {
    const id = await newPlan();
    for (let i = 0; i < 5; i++) await addSource(ana, id, { image: Buffer.from('png'), imageType: 'image/png' });
    await expect(addSource(ana, id, { image: Buffer.from('png'), imageType: 'image/png' })).rejects.toMatchObject({ status: 400 });
    expect(db.sources).toHaveLength(5);
    await addSource(ana, id, { text: WORK }); // instructions are not photos
  });

  test('the parser reads a message the model has not answered yet; an instruction removed with × is gone, and the chat says so', async () => {
    const id = await newPlan();
    await sendMessage(ana, id, 'В събота не мога');
    expect((await getPlan(ana, id, 3)).plan.windows).toEqual([{ day: 6, from: '07:30', to: '21:30', what: 'зает' }]);
    // The model keeps it as an instruction and answers.
    const m = model(async () => ({ reply: 'Разбрах.', instructions: ['В събота не мога.'], windows: [{ day: 6, from: '07:30', to: '21:30', what: 'зает' }] }));
    await processNextPlan(m);
    const saved = db.sources.find((s) => s.planId === id)!;
    await removeSource(ana, id, saved.id);
    const view = await getPlan(ana, id, 3);
    expect(view.plan.windows).toEqual([]); // the old message is not read again
    expect(view.messages.map((x) => x.content)).toEqual(['В събота не мога', 'Разбрах.', 'Махнах „В събота не мога.“']);
  });

  test('AC-25 from the chat the model skips the КЗ lab in week 6 and notes a test on the КЗ lecture in week 7; a note for a class that is not there rejects the whole answer', async () => {
    const id = await createPlan(ana, { name: 'С разписание', myGroup: '222', fromSample: true });
    const kz = db.entries.find((e) => e.planId === id && e.course === 'КЗ' && e.type === 'lab' && e.day === 6 && e.startsAt === '10:30')!.id;
    await sendMessage(ana, id, 'В 6. седмица не ходя на КЗ упражнение, а в 7. има контролно на КЗ лекцията');
    const m = model(async () => ({
      reply: 'Готово.',
      windows: [],
      notes: [
        { course: 'КЗ', type: 'lab', week: 6, text: 'Не ходя' },
        { course: 'КЗ', type: 'lecture', week: 7, text: 'Контролно' },
        { course: 'КЗ', type: 'lecture', week: 7, text: 'Контролно' }, // the same note twice is saved once
      ],
    }));
    await processNextPlan(m);
    expect((await getPlan(ana, id, 6)).classes.find((c) => c.id === kz)).toMatchObject({ skipped: true, label: null });
    expect((await getPlan(ana, id, 8)).classes.find((c) => c.id === kz)).toMatchObject({ skipped: false });
    expect((await getPlan(ana, id, 7)).classes.filter((c) => c.course === 'КЗ' && c.type === 'lecture').map((c) => c.notes.map((n) => n.text))).toEqual([['Контролно']]);
    expect(m.readPlan).toHaveBeenCalledWith(expect.objectContaining({ notes: [] }));

    // Taking it back, and the model sees the notes already there.
    await sendMessage(ana, id, 'Все пак ще ходя на КЗ в 6. седмица');
    const back = model(async () => ({ reply: 'Връщам го.', windows: [], notes: [{ course: 'КЗ', type: 'lab', week: 6, text: 'не ходя', remove: true }] }));
    await processNextPlan(back);
    expect(back.readPlan).toHaveBeenCalledWith(expect.objectContaining({ notes: expect.arrayContaining([{ course: 'КЗ', type: 'lab', week: 6, text: 'Не ходя' }]) }));
    expect((await getPlan(ana, id, 6)).classes.find((c) => c.id === kz)).toMatchObject({ skipped: false });

    // Week 1 has no УП lab (it starts in week 3), and group 222 has no ПИ lecture: the whole answer is rejected.
    for (const wrong of [{ course: 'УП', type: 'lab', week: 1, text: 'Не ходя' }, { course: 'ПИ', type: 'lecture', week: null, text: 'x' }]) {
      await sendMessage(ana, id, 'Още една промяна');
      const before = db.notes.length;
      await processNextPlan(model(async () => ({ reply: 'Готово.', windows: [{ day: 1, from: '09:00', to: '10:00', what: 'x' }], notes: [wrong] })));
      expect(db.notes).toHaveLength(before);
      expect((await getPlan(ana, id, 3)).plan).toMatchObject({ modelStatus: 'failed' });
    }
  });

  test('an empty list of instructions from the model keeps the instructions the plan has', async () => {
    const id = await newPlan();
    await sendMessage(ana, id, 'Работя от 9 до 17');
    await processNextPlan(model(async () => ({ reply: 'Добре.', windows: [], instructions: ['Работя от 9 до 17.'] })));
    await sendMessage(ana, id, 'Благодаря');
    await processNextPlan(model(async () => ({ reply: 'Моля.', windows: [], instructions: [], subjects: [], notes: [] })));
    expect(db.sources.filter((s) => s.planId === id).map((s) => s.text)).toEqual(['Работя от 9 до 17.']);
  });

  test('a note the model gives for every week lands on every class of that subject the plan follows', async () => {
    const id = await createPlan(ana, { name: 'С разписание', myGroup: '222', fromSample: true });
    await sendMessage(ana, id, 'КЗ лекцията е в Teams');
    await processNextPlan(model(async () => ({ reply: 'Добре.', windows: [], notes: [{ course: 'КЗ', type: 'lecture', week: null, text: 'В Teams' }] })));
    expect(db.notes.filter((n) => n.planId === id)).toMatchObject([{ week: null, text: 'В Teams' }]);
  });

  test('a skipped class has no label', async () => {
    const id = await createPlan(ana, { name: 'С разписание', myGroup: '222', fromSample: true });
    const lab = db.entries.find((e) => e.planId === id && e.course === 'УП' && e.type === 'lab' && e.day === 1)!.id;
    await addNote(ana, { entryId: lab, week: null, text: 'Не ходя' });
    expect((await getPlan(ana, id, 3)).classes.find((c) => c.id === lab)).toMatchObject({ skipped: true, label: null, reason: 'Не ходите на това занятие.' });
  });

  test('a photo is a source; it can be read back and removed', async () => {
    const id = await newPlan();
    await addSource(ana, id, { image: Buffer.from('png'), imageType: 'image/png' });
    expect(await getSourceImage(ana, id, 1)).toEqual({ data: Buffer.from('png'), type: 'image/png' });
    await removeSource(ana, id, 1);
    await expect(getSourceImage(ana, id, 1)).rejects.toMatchObject({ status: 404 });
    await expect(removeSource(ana, id, 1)).rejects.toMatchObject({ status: 404 });
    await expect(getSourceImage(ana, id, NaN)).rejects.toMatchObject({ status: 404 });
    await expect(removeSource(ana, id, NaN)).rejects.toMatchObject({ status: 404 });
  });

  test.each([
    ['nothing', {}],
    ['both a text and a photo', { text: 'x', image: Buffer.from('p'), imageType: 'image/png' }],
    ['a text over 1000 characters', { text: 'x'.repeat(1001) }],
    ['a file that is not an image', { image: Buffer.from('p'), imageType: 'application/pdf' }],
    ['a photo with no type', { image: Buffer.from('p') }],
    ['a photo over 10 MB', { image: Buffer.alloc(10 * 1024 * 1024 + 1), imageType: 'image/png' }],
  ])('a source with %s gives 400', async (_name, input) => {
    const id = await newPlan();
    await expect(addSource(ana, id, input)).rejects.toMatchObject({ status: 400 });
    expect(db.sources).toHaveLength(0);
  });

  test.each([
    ['an empty name', { name: ' ', myGroup: '222' }],
    ['a group that is not a TU group number', { name: 'План', myGroup: 'група 5' }],
  ])('a plan with %s gives 400', async (_name, input) => {
    await expect(createPlan(ana, input)).rejects.toMatchObject({ status: 400 });
    await expect(createPlan(null, input)).rejects.toMatchObject({ status: 401 });
  });

  test('a plan starts empty, or with the 19 classes of the sample timetable', async () => {
    await createPlan(ana, { name: 'Празна', myGroup: '221а' });
    expect(db.entries).toHaveLength(0);
    await newPlan();
    expect(db.entries).toHaveLength(19);
  });

  test('an empty chat message gives 400', async () => {
    const id = await newPlan();
    await expect(sendMessage(ana, id, '  ')).rejects.toMatchObject({ status: 400 });
  });
});

describe('sharing and access', () => {
  test('AC-19 a plan shared with Boris shows under his shared plans; he can read it, and adding a source or a message gets 403', async () => {
    const id = await newPlan();
    await sharePlan(ana, id, 'boris@test.bg');
    expect((await listMyPlans(boris)).shared.map((p) => p.id)).toEqual([id]);
    expect(await getPlan(boris, id, 3)).toMatchObject({ isOwner: false, canEdit: false, shares: [] });
    await expect(addSource(boris, id, { text: WORK })).rejects.toMatchObject({ status: 403 });
    await expect(sendMessage(boris, id, 'здравей')).rejects.toMatchObject({ status: 403 });
    expect(db.sources).toHaveLength(0);
    expect(db.messages).toHaveLength(0);
  });

  test('AC-20 for a stranger the plan does not exist (404) for reading, changing and deleting; nobody signed in 401; an admin can open and change any plan', async () => {
    const id = await newPlan();
    await expect(getPlan(vera, id, 3)).rejects.toMatchObject({ status: 404 });
    await expect(addSource(vera, id, { text: WORK })).rejects.toMatchObject({ status: 404 });
    await expect(sendMessage(vera, id, 'x')).rejects.toMatchObject({ status: 404 });
    await expect(sharePlan(vera, id, 'vera@test.bg')).rejects.toMatchObject({ status: 404 });
    await expect(getSourceImage(vera, id, 1)).rejects.toMatchObject({ status: 404 });
    await expect(deletePlan(vera, id)).rejects.toMatchObject({ status: 404 });
    await expect(getPlan(null, id, 3)).rejects.toMatchObject({ status: 401 });
    expect(db.plans).toHaveLength(1);
    expect(await getPlan(admin, id, 3)).toMatchObject({ isOwner: false, canEdit: true });
    await addSource(admin, id, { text: WORK });
    expect(db.sources).toHaveLength(1);
  });

  test('an admin sees everyone else\'s plans; a student does not', async () => {
    const id = await newPlan();
    expect((await listMyPlans(admin)).others.map((p) => p.id)).toEqual([id]);
    expect((await listMyPlans(boris)).others).toEqual([]);
    await expect(listMyPlans(null)).rejects.toMatchObject({ status: 401 });
  });

  test('a reader cannot share, unshare or delete; the owner can unshare and delete', async () => {
    const id = await newPlan();
    await sharePlan(ana, id, 'boris@test.bg');
    await expect(sharePlan(boris, id, 'vera@test.bg')).rejects.toMatchObject({ status: 403 });
    await expect(deletePlan(boris, id)).rejects.toMatchObject({ status: 403 });
    expect((await getPlan(ana, id, 3)).shares).toEqual([{ userId: 'boris', email: 'boris@test.bg' }]);
    await unsharePlan(ana, id, 'boris');
    await expect(getPlan(boris, id, 3)).rejects.toMatchObject({ status: 404 });
    await expect(unsharePlan(boris, id, 'boris')).rejects.toMatchObject({ status: 404 });
    await deletePlan(ana, id);
    expect(db.plans).toHaveLength(0);
  });

  test('R3 sharing with an unknown email answers exactly like a known one (no way to probe who is registered) and shares nothing', async () => {
    const id = await newPlan();
    await expect(sharePlan(ana, id, 'nobody@test.bg')).resolves.toBeUndefined();
    await expect(sharePlan(ana, id, 'boris@test.bg')).resolves.toBeUndefined();
    expect(db.shares).toEqual([{ planId: id, userId: 'boris' }]);
    await expect(sharePlan(ana, id, 'ana@test.bg')).rejects.toMatchObject({ status: 400 });
  });

  test.each([999, NaN])('plan %s that does not exist gives 404', async (id) => {
    await expect(getPlan(ana, id, 3)).rejects.toMatchObject({ status: 404 });
  });
});
