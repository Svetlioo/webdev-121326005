import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  claimNextImport,
  findImport,
  insertImport,
  listImports as listImportRows,
  publishDraft,
  updateImport,
  type DraftClass,
  type Import,
} from '../../src/data/imports';
import { ModelOutputError, ModelTimeoutError, ModelUnavailableError, type ModelClient } from '../../src/model/client';
import {
  fetchPage,
  getImport,
  listImports,
  pageText,
  processNextImport,
  publishImport,
  removeDraftClass,
  retryImport,
  startImport,
  TIMEOUT_MESSAGE,
} from '../../src/services/imports';
import { createPlan } from '../../src/services/plans';
import { ana, installFakes, vera } from '../fakes';

// The data layer is replaced and the model is a fake client: no database, no network.
vi.mock('../../src/data/entries');
vi.mock('../../src/data/notes');
vi.mock('../../src/data/plans');
vi.mock('../../src/data/users');
vi.mock('../../src/data/imports', () => ({
  insertImport: vi.fn(),
  listImports: vi.fn(),
  findImport: vi.fn(),
  claimNextImport: vi.fn(),
  updateImport: vi.fn(),
  publishDraft: vi.fn(),
}));

const photo = Buffer.from('fake png bytes');

const good: DraftClass = {
  course: 'УП', type: 'lab', day: 1, startsAt: '13:45', endsAt: '16:30', room: '705', startWeek: 3,
  groups: [{ name: '222', parity: 'odd' }],
};
const anImport = (fields: Partial<Import> = {}): Import => ({
  id: 1, planId: 1, status: 'ready', sourceUrl: null, hasImage: true, instructions: '', draft: [good], error: null, createdAt: '', ...fields,
});
const fakeModel = (answer: () => Promise<unknown>): ModelClient => ({ readSchedule: vi.fn(answer), readPlan: vi.fn() });
const job = { id: 1, planId: 1, sourceUrl: null, image: photo, imageType: 'image/png', instructions: '' };

beforeEach(async () => {
  vi.resetAllMocks();
  installFakes();
  vi.mocked(listImportRows).mockResolvedValue([]);
  await createPlan(ana, { name: 'Зима', myGroup: '222' }); // plan 1, owned by ana
  vi.mocked(insertImport).mockImplementation(async () => anImport({ status: 'queued', draft: null }));
});

describe('the import flow', () => {
  test('AC-3 a student who imports a photo into their plan sees "queued" at once, then "ready", and entries change only on Publish', async () => {
    const created = await startImport(ana, 1, { image: photo, imageType: 'image/png' });
    expect(created.status).toBe('queued');
    expect(insertImport).toHaveBeenCalledWith(1, { sourceUrl: null, image: photo, imageType: 'image/png', instructions: '' }, 'ana');

    vi.mocked(claimNextImport).mockResolvedValue(job);
    const model = fakeModel(async () => ({ classes: [good] }));
    await processNextImport(model);
    expect(model.readSchedule).toHaveBeenCalledWith(expect.objectContaining({ image: { data: photo, type: 'image/png' } }));
    expect(updateImport).toHaveBeenCalledWith(1, 'ready', { draft: [good], error: null });
    expect(publishDraft).not.toHaveBeenCalled();

    vi.mocked(findImport).mockResolvedValue(anImport());
    vi.mocked(publishDraft).mockResolvedValue(true);
    await publishImport(ana, 1);
    expect(publishDraft).toHaveBeenCalledWith(1, 1, [good]);

    // A second press finds it already published.
    vi.mocked(publishDraft).mockResolvedValue(false);
    await expect(publishImport(ana, 1)).rejects.toMatchObject({ status: 400 });
  });

  test('AC-4 when the model does not answer in time the import fails with the message, and nothing is published', async () => {
    vi.mocked(claimNextImport).mockResolvedValue(job);
    await processNextImport(fakeModel(async () => Promise.reject(new ModelTimeoutError('timeout'))));
    expect(updateImport).toHaveBeenCalledWith(1, 'failed', { error: TIMEOUT_MESSAGE });
    expect(TIMEOUT_MESSAGE).toBe('Моделът не отговори навреме. Опитайте отново или въведете занятията ръчно.');
    expect(publishDraft).not.toHaveBeenCalled();
  });

  test.each([
    [new ModelUnavailableError('down'), 'Моделът не е достъпен'],
    [new ModelOutputError('not JSON'), 'неразбираем отговор'],
  ])('a model that is down or answers nonsense fails the import: %s', async (error, message) => {
    vi.mocked(claimNextImport).mockResolvedValue(job);
    await processNextImport(fakeModel(async () => Promise.reject(error)));
    expect(vi.mocked(updateImport).mock.calls[0][2]!.error).toContain(message);
  });

  test('an answer without a list of classes fails the import', async () => {
    vi.mocked(claimNextImport).mockResolvedValue(job);
    await processNextImport(fakeModel(async () => ({ something: 'else' })));
    expect(vi.mocked(updateImport).mock.calls[0][1]).toBe('failed');
  });

  test('a page import sends the page text, without the student lists', async () => {
    vi.mocked(claimNextImport).mockResolvedValue({ ...job, sourceUrl: 'https://cs.fcst.bg/page.php?id=89', image: null, imageType: null });
    const page = async () => '<h1>Разписание</h1><p>ПИ л.у. 1211</p><h2>Списъчен състав</h2><p>Студент Студентов</p>';
    const model = fakeModel(async () => [{ ...good, startsAt: '7:30', endsAt: '10:15', groups: [{ name: '222' }] }]);
    await processNextImport(model, page);
    const sent = vi.mocked(model.readSchedule).mock.calls[0][0];
    expect(sent.text).toContain('ПИ л.у. 1211');
    expect(sent.text).not.toContain('Студентов');
    expect(sent.image).toBeUndefined();
    // Model output is tidied but not trusted: '7:30' becomes '07:30', a missing parity becomes 'all'.
    expect(vi.mocked(updateImport).mock.calls[0][2]!.draft![0]).toMatchObject({ startsAt: '07:30', groups: [{ name: '222', parity: 'all' }] });
  });

  test('a sparse or broken answer becomes classes with empty fields, which the review then flags', async () => {
    vi.mocked(claimNextImport).mockResolvedValue(job);
    await processNextImport(fakeModel(async () => [null, { groups: [null] }]));
    const draft = vi.mocked(updateImport).mock.calls[0][2]!.draft!;
    expect(draft[0]).toEqual({ course: '', type: '', day: NaN, startsAt: '00000', endsAt: '00000', room: '', startWeek: 1, groups: [] });
    expect(draft[1].groups).toEqual([{ name: '', parity: 'all' }]);
  });

  test('a page that cannot be read fails the import with a page message', async () => {
    vi.mocked(claimNextImport).mockResolvedValue({ ...job, sourceUrl: 'https://example.com', image: null, imageType: null });
    await processNextImport(fakeModel(async () => []), async () => Promise.reject(new Error('404')));
    expect(vi.mocked(updateImport).mock.calls[0][2]!.error).toContain('Страницата не може да бъде изтеглена');
  });

  test('an empty queue does nothing', async () => {
    vi.mocked(claimNextImport).mockResolvedValue(null);
    expect(await processNextImport(fakeModel(async () => []))).toBeNull();
    expect(updateImport).not.toHaveBeenCalled();
  });
});

describe('review', () => {
  test('AC-5 a class at a time that is not a TU Sofia period, or for a group that is not a TU group number, is invalid and blocks Publish', async () => {
    const offPeriod = { ...good, startsAt: '08:00' };
    const noGroup = { ...good, groups: [{ name: 'група x', parity: 'all' as const }] };
    vi.mocked(findImport).mockResolvedValue(anImport({ draft: [good, offPeriod, noGroup] }));

    const review = await getImport(ana, 1);
    expect(review.draft.map((c) => c.problems.length > 0)).toEqual([false, true, true]);
    expect(review.draft[1].problems[0]).toContain('08:00');
    expect(review.draft[2].problems[0]).toContain('група x');
    expect(review.canPublish).toBe(false);
    await expect(publishImport(ana, 1)).rejects.toMatchObject({ status: 400 });
    expect(publishDraft).not.toHaveBeenCalled();

    // Removing the invalid classes makes it publishable.
    await removeDraftClass(ana, 1, 2);
    expect(updateImport).toHaveBeenCalledWith(1, 'ready', { draft: [good, offPeriod] });
    vi.mocked(findImport).mockResolvedValue(anImport({ draft: [good] }));
    expect((await getImport(ana, 1)).canPublish).toBe(true);
  });

  test('every field of a class is checked', async () => {
    const bad = { course: ' ', type: 'party', day: 7, startsAt: '07:30', endsAt: '07:30', room: '', startWeek: 0, groups: [] };
    vi.mocked(findImport).mockResolvedValue(anImport({ draft: [bad as DraftClass, { ...good, groups: [{ name: '222', parity: 'x' as never }] }] }));
    const review = await getImport(ana, 1);
    expect(review.draft[0].problems).toHaveLength(7);
    expect(review.draft[1].problems).toHaveLength(1);
    vi.mocked(findImport).mockResolvedValue(anImport({ draft: [{ ...good, groups: [{ name: '222', parity: 'odd' }, { name: '222', parity: 'even' }] }] }));
    expect((await getImport(ana, 1)).draft[0].problems).toEqual(['Група се повтаря в едно занятие.']);
  });

  test('an import that is not ready, or has no classes, cannot be published', async () => {
    vi.mocked(findImport).mockResolvedValue(anImport({ status: 'failed', draft: null }));
    expect((await getImport(ana, 1)).canPublish).toBe(false);
    await expect(publishImport(ana, 1)).rejects.toMatchObject({ status: 400 });
    vi.mocked(findImport).mockResolvedValue(anImport({ draft: [] }));
    await expect(publishImport(ana, 1)).rejects.toMatchObject({ status: 400 });
  });

  test.each([-1, 1, 0.5])('removing class %s that is not in the draft gives 404', async (index) => {
    vi.mocked(findImport).mockResolvedValue(anImport());
    await expect(removeDraftClass(ana, 1, index)).rejects.toMatchObject({ status: 404 });
  });

  test.each([999, NaN])('import %s that does not exist gives 404', async (id) => {
    vi.mocked(findImport).mockResolvedValue(null);
    await expect(getImport(ana, id)).rejects.toMatchObject({ status: 404 });
  });

  test('a failed import can be retried; any other cannot', async () => {
    vi.mocked(findImport).mockResolvedValue(anImport({ status: 'failed' }));
    await retryImport(ana, 1);
    expect(updateImport).toHaveBeenCalledWith(1, 'queued');
    vi.mocked(findImport).mockResolvedValue(anImport({ status: 'ready' }));
    await expect(retryImport(ana, 1)).rejects.toMatchObject({ status: 400 });
  });

  test('the owner lists the imports of the plan', async () => {
    vi.mocked(listImportRows).mockResolvedValue([anImport()]);
    expect(await listImports(ana, 1)).toHaveLength(1);
    expect(listImportRows).toHaveBeenCalledWith(1);
  });
});

describe('who may import', () => {
  test('AC-10 a student who starts an import for a plan that is not theirs gets 403 and no row is added to imports', async () => {
    await expect(startImport(vera, 1, { sourceUrl: 'https://cs.fcst.bg/page.php?id=89' })).rejects.toMatchObject({ status: 403 });
    expect(insertImport).not.toHaveBeenCalled();
  });

  test.each([
    ['list', () => listImports(vera, 1)],
    ['review', () => getImport(vera, 1)],
    ['remove', () => removeDraftClass(vera, 1, 0)],
    ['publish', () => publishImport(vera, 1)],
    ['retry', () => retryImport(vera, 1)],
  ])('someone who does not own the plan cannot %s its imports', async (_name, action) => {
    vi.mocked(findImport).mockResolvedValue(anImport());
    await expect(action()).rejects.toMatchObject({ status: 403 });
    expect(publishDraft).not.toHaveBeenCalled();
    expect(updateImport).not.toHaveBeenCalled();
  });

  test('somebody who is not signed in gets 401', async () => {
    await expect(startImport(null, 1, { image: photo, imageType: 'image/png' })).rejects.toMatchObject({ status: 401 });
  });
});

describe('what an import may start from', () => {
  test('R2 a new import waits until the plan\'s previous one is done (409)', async () => {
    vi.mocked(listImportRows).mockResolvedValue([anImport({ status: 'processing' })]);
    await expect(startImport(ana, 1, { sourceUrl: 'https://cs.fcst.bg/page.php?id=89' })).rejects.toMatchObject({ status: 409 });
    expect(insertImport).not.toHaveBeenCalled();
    vi.mocked(listImportRows).mockResolvedValue([anImport({ status: 'failed' })]);
    await startImport(ana, 1, { sourceUrl: 'https://cs.fcst.bg/page.php?id=89' });
    expect(insertImport).toHaveBeenCalled();
  });

  test('a page address and a photo together', async () => {
    await startImport(ana, 1, { sourceUrl: 'https://cs.fcst.bg/page.php?id=89', image: photo, imageType: 'image/png' });
    expect(insertImport).toHaveBeenCalledWith(1, { sourceUrl: 'https://cs.fcst.bg/page.php?id=89', image: photo, imageType: 'image/png', instructions: '' }, 'ana');
  });

  test('a page address, trimmed, with instructions', async () => {
    await startImport(ana, 1, { sourceUrl: ' https://cs.fcst.bg/page.php?id=89 ', instructions: ' само 222 ' });
    expect(insertImport).toHaveBeenCalledWith(
      1,
      { sourceUrl: 'https://cs.fcst.bg/page.php?id=89', image: null, imageType: null, instructions: 'само 222' },
      'ana',
    );
  });

  test.each([
    ['nothing', {}],
    ['an address that is not http', { sourceUrl: 'file:///etc/passwd' }],
    ['R1 an address in my home network', { sourceUrl: 'http://192.168.1.1/' }],
    ['R1 the laptop\'s own model server', { sourceUrl: 'http://127.0.0.1:11434/api/tags' }],
    ['R1 a site that is not TU Sofia\'s', { sourceUrl: 'https://example.com/schedule' }],
    ['R1 an address that only looks like one', { sourceUrl: 'http://[not-a-host' }],
    ['a photo that is not an image', { image: photo, imageType: 'application/pdf' }],
    ['a photo with no type', { image: photo }],
    ['a photo over 10 MB', { image: Buffer.alloc(10 * 1024 * 1024 + 1), imageType: 'image/png' }],
  ])('%s gives 400', async (_name, input) => {
    await expect(startImport(ana, 1, input)).rejects.toMatchObject({ status: 400 });
    expect(insertImport).not.toHaveBeenCalled();
  });
});

describe('reading a page', () => {
  test('drops scripts, styles, markup and everything from "Списъчен състав" on', () => {
    expect(pageText('<style>x{}</style><script>alert(1)</script><td>КЗ&nbsp;л.</td>\n<p>Списъчен състав</p> Иван')).toBe(' КЗ л. ');
  });

  test('a "Списъчен състав" tab in the menu before the timetable does not cut the timetable; the student section does', () => {
    const html = `<nav><a href="#classes">Разписание</a> <a href="#ksi-students">Списъчен състав</a></nav>
      <section id="ksi-classes">Понеделник 07:30 – 10:15 ОИТ Лекция Зала 1216</section>
      <section id="ksi-students"><h2>Списък</h2><p>Иван Иванов</p></section>`;
    const text = pageText(html);
    expect(text).toContain('ОИТ Лекция Зала 1216');
    expect(text).not.toContain('Иван');
  });

  test('a page without student lists is kept whole', () => {
    expect(pageText('<p>ОИТ</p>')).toBe(' ОИТ ');
  });

  test('R1 only TU Sofia pages are imported, never through a redirect, and a huge page is cut off', async () => {
    await startImport(ana, 1, { sourceUrl: 'https://tu-sofia.bg/schedule' });
    await startImport(ana, 1, { sourceUrl: 'https://cs.fcst.bg/page.php?id=89' });
    expect(insertImport).toHaveBeenCalledTimes(2);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('x'.repeat(3_000_000)));
    expect((await fetchPage('https://cs.fcst.bg')).length).toBe(2_000_000);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
    fetchMock.mockRestore();
  });

  test('fetchPage returns the page, or fails on an error status', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(new Response('<p>ok</p>'));
    expect(await fetchPage('https://cs.fcst.bg')).toBe('<p>ok</p>');
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(fetchPage('https://cs.fcst.bg')).rejects.toThrow('404');
    fetchMock.mockRestore();
  });
});
