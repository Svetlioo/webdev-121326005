import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  claimNextImport,
  findImport,
  findImportImage,
  insertImport,
  listImports as listImportRows,
  publishDraft,
  updateImport,
  type DraftClass,
  type Import,
} from '../../src/data/imports';
import { ModelOutputError, ModelTimeoutError, ModelUnavailableError, type ModelClient } from '../../src/model/client';
import {
  checkDraftClass,
  fetchPage,
  isPrivateAddress,
  isPublicUrl,
  lookupAll,
  getImport,
  getImportImage,
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
  findImportImage: vi.fn(),
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
  id: 1, planId: 1, status: 'ready', sourceUrl: null, hasImage: true, instructions: '', draft: [good], error: null, createdAt: '', updatedAt: '', ...fields,
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
    const model = fakeModel(async () => [{ ...good, startsAt: '7:30', endsAt: '10:15', room: 'Зала 705', groups: [{ name: '222' }] }]);
    await processNextImport(model, page);
    const sent = vi.mocked(model.readSchedule).mock.calls[0][0];
    expect(sent.text).toContain('ПИ л.у. 1211');
    expect(sent.text).not.toContain('Студентов');
    expect(sent.image).toBeUndefined();
    // Model output is tidied but not trusted: '7:30' becomes '07:30', a missing parity becomes 'all'.
    expect(vi.mocked(updateImport).mock.calls[0][2]!.draft![0]).toMatchObject({ startsAt: '07:30', room: '705', groups: [{ name: '222', parity: 'all' }] });
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
  test('AC-5 a class at a time that is not a TU Sofia period, or for a group that is not letters and digits, is invalid and blocks Publish', async () => {
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

  test('a group is letters and digits, at most 10 characters and at most 3 digits', () => {
    const problems = (name: string) => checkDraftClass({ ...good, groups: [{ name, parity: 'all' }] });
    for (const name of ['222', '221а', '221Б', '432a', 'КСИ1', 'А', '12', 'ИнфТех'])
      expect(problems(name), name).toEqual([]);
    for (const name of ['2222', '22а22', 'гр. 222', '222-а', '222 а', 'КомпютърниСистеми'])
      expect(problems(name), name).toHaveLength(1);
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

  test('a failed import is not retried while another import of the plan is still being read (409)', async () => {
    vi.mocked(findImport).mockResolvedValue(anImport({ status: 'failed' }));
    vi.mocked(listImportRows).mockResolvedValue([anImport({ id: 2, status: 'processing' })]);
    await expect(retryImport(ana, 1)).rejects.toMatchObject({ status: 409 });
    expect(updateImport).not.toHaveBeenCalled();
  });

  test('the owner lists the imports of the plan', async () => {
    vi.mocked(listImportRows).mockResolvedValue([anImport()]);
    expect(await listImports(ana, 1)).toHaveLength(1);
    expect(listImportRows).toHaveBeenCalledWith(1);
  });
});

describe('the photo of an import', () => {
  test('the owner sees the photo an import started with; a stranger gets 404; an import without one 404', async () => {
    vi.mocked(findImport).mockResolvedValue(anImport({ hasImage: true }));
    vi.mocked(findImportImage).mockResolvedValue({ data: photo, type: 'image/png' });
    expect(await getImportImage(ana, 1)).toEqual({ data: photo, type: 'image/png' });
    await expect(getImportImage(vera, 1)).rejects.toMatchObject({ status: 404 });
    vi.mocked(findImportImage).mockResolvedValue(null);
    await expect(getImportImage(ana, 1)).rejects.toMatchObject({ status: 404 });
  });
});

describe('who may import', () => {
  test('AC-10 a student who starts an import for a plan that is not theirs gets 404 and no row is added to imports', async () => {
    await expect(startImport(vera, 1, { sourceUrl: 'https://cs.fcst.bg/page.php?id=89' })).rejects.toMatchObject({ status: 404 });
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
    await expect(action()).rejects.toMatchObject({ status: 404 });
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
    ['R1 the cloud metadata address', { sourceUrl: 'http://169.254.169.254/latest/meta-data' }],
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
  test('any page: code, styles, menus, headers and footers go; a table keeps its rows and cells', () => {
    const html = `<head><title>x</title></head><!-- note --><header>Лого</header><nav><a>Меню</a></nav>
      <script>alert(1)</script><style>td{}</style><noscript>JS</noscript>
      <table><tr><th>Ден</th><th>Час</th><th>Предмет</th></tr><tr><td>Понеделник</td><td>07:30&nbsp;– 10:15</td><td>ОИТ&#8209;л. &#x2116;1</td></tr></table>
      <p>Зала&nbsp;1216 &amp; &bdquo;Java&ldquo; &unknown;</p><br><footer>© ТУ</footer>`;
    expect(pageText(html)).toBe('Ден | Час | Предмет\nПонеделник | 07:30 – 10:15 | ОИТ‑л. №1\nЗала 1216 & "Java" &unknown;');
  });

  test('personal data goes: a student section (by id or heading), e-mail addresses, phone numbers and faculty numbers', () => {
    expect(pageText('<p>ОИТ</p><section id="ksi-students"><p>Иван Иванов</p></section>')).toBe('ОИТ');
    expect(pageText('<p>ОИТ</p><details><summary><span>Списъчен състав</span></summary>Иван</details>')).toBe('ОИТ');
    expect(pageText('<p>ОИТ</p><h2>Списък на студентите</h2><p>Мария</p>')).toBe('ОИТ');
    expect(pageText('<p>Пишете на ivan.petrov@tu-sofia.bg или +359 88 123 4567, 0888 123 456, фак. № 121326005</p>')).toBe('Пишете на или , , фак. №');
    // a menu link to the student list does not cut the timetable that follows it
    expect(pageText('<nav><a href="#ksi-students">Списъчен състав</a></nav><p>ОИТ Лекция Зала 1216</p>')).toBe('ОИТ Лекция Зала 1216');
  });

  test('a page without student lists is kept whole, up to 50,000 characters', () => {
    expect(pageText('<p>ОИТ</p>')).toBe('ОИТ');
    expect(pageText(`<p>${'а'.repeat(60_000)}</p>`)).toHaveLength(50_000);
  });

  test('R1 any public page may be imported; an address in this machine or its network may not', async () => {
    await startImport(ana, 1, { sourceUrl: 'https://cs.fcst.bg/page.php?id=89' });
    await startImport(ana, 1, { sourceUrl: 'https://example.com/schedule.html' });
    expect(insertImport).toHaveBeenCalledTimes(2);
    for (const url of ['http://localhost:11434/api/tags', 'http://127.0.0.1:3000', 'http://192.168.1.1', 'http://[::1]/', 'http://router', 'http://nas.local'])
      await expect(startImport(ana, 1, { sourceUrl: url })).rejects.toMatchObject({ status: 400 });
    expect(insertImport).toHaveBeenCalledTimes(2);
  });

  test('which addresses are private', () => {
    for (const ip of ['0.0.0.0', '10.1.2.3', '127.0.0.1', '224.0.0.1', '100.64.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.0.1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::7f00:1', '::ffff:a00:1', '::', '::1', 'fc00::1', 'fd12::1', 'fe80::1'])
      expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '::ffff:808:808', '100.63.0.1', '100.128.0.1', '169.253.0.1', '172.15.0.1', '172.32.0.1', '192.169.0.1', '2a00:1450::1'])
      expect(isPrivateAddress(ip), ip).toBe(false);
    expect(isPublicUrl('https://8.8.8.8/x')).toBe(true);
    for (const url of ['http://[::ffff:127.0.0.1]/', 'http://[::127.0.0.1]/', 'http://2130706433/', 'http://0x7f.1/', 'http://127.1/'])
      expect(isPublicUrl(url), url).toBe(false);
    expect(isPublicUrl('ftp://example.com')).toBe(false);
    expect(isPublicUrl('http://a.localhost')).toBe(false);
    expect(isPublicUrl('not a url')).toBe(false);
  });

  test('fetchPage follows at most 3 redirects, checks every host, and reads only web pages up to 2 MB', async () => {
    const publicDns = async () => ['93.184.216.34'];
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });

    fetchMock.mockResolvedValueOnce(redirect('/page')).mockResolvedValueOnce(new Response('<p>ok</p>', { headers: { 'content-type': 'text/html' } }));
    expect(await fetchPage('http://example.com', publicDns)).toBe('<p>ok</p>');
    expect(fetchMock.mock.calls[1][0]).toBe('http://example.com/page');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });

    fetchMock.mockResolvedValueOnce(redirect('http://127.0.0.1:11434/api/tags'));
    await expect(fetchPage('http://example.com', publicDns)).rejects.toThrow('not a public address');
    await expect(fetchPage('http://evil.example', async () => ['10.0.0.5'])).rejects.toThrow('private network');

    fetchMock.mockResolvedValue(redirect('http://example.com/again'));
    await expect(fetchPage('http://example.com', publicDns)).rejects.toThrow('too many redirects');

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
    await expect(fetchPage('https://8.8.8.8', publicDns)).rejects.toThrow('304');
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(fetchPage('http://example.com', publicDns)).rejects.toThrow('404');
    fetchMock.mockResolvedValueOnce(new Response('jpeg', { headers: { 'content-type': 'image/jpeg' } }));
    await expect(fetchPage('http://example.com', publicDns)).rejects.toThrow('not a web page');

    fetchMock.mockResolvedValueOnce(new Response(new TextEncoder().encode('x'.repeat(3_000_000))));
    expect(await fetchPage('http://example.com', publicDns)).toHaveLength(2_000_000);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    expect(await fetchPage('http://example.com', publicDns)).toBe('');
    fetchMock.mockRestore();
  });

  test('host names are looked up in DNS', async () => {
    expect(await lookupAll('localhost')).toContain('127.0.0.1');
  });
});
