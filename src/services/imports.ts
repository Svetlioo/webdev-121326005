import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { Actor } from '../auth';
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
  type ImportJob,
} from '../data/imports';
import { ModelOutputError, ModelTimeoutError, type ModelClient } from '../model/client';
import { editablePlan } from './access';
import { AppError } from './errors';
import { LAST_WEEK } from './schedule';

export const TIMEOUT_MESSAGE = 'Моделът не отговори навреме. Опитайте отново или въведете занятията ръчно.';
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** The 14 TU Sofia periods of 45 minutes; a class starts at one and ends at one. */
const PERIODS = [
  ['07:30', '08:15'], ['08:30', '09:15'], ['09:30', '10:15'], ['10:30', '11:15'], ['11:30', '12:15'],
  ['12:30', '13:15'], ['13:45', '14:30'], ['14:45', '15:30'], ['15:45', '16:30'], ['16:45', '17:30'],
  ['17:45', '18:30'], ['18:45', '19:30'], ['19:45', '20:30'], ['20:45', '21:30'],
];
const STARTS = PERIODS.map((p) => p[0]);
/** A group name: letters and digits only, at most 10 characters and at most 3 digits, such as 222, 221а, КСИ1 or А. */
const isGroupName = (name: string) => /^[0-9a-zа-яѝ]{1,10}$/i.test(name) && (name.match(/\d/g) ?? []).length <= 3;
const ENDS = PERIODS.map((p) => p[1]);

export type CheckedClass = DraftClass & { problems: string[] };
export type ImportForReview = Omit<Import, 'draft'> & { draft: CheckedClass[]; canPublish: boolean };

/** Why a draft class cannot be published, in words a publisher can act on. Empty means valid. */
export function checkDraftClass(c: DraftClass): string[] {
  const problems: string[] = [];
  if (!c.course.trim()) problems.push('Липсва дисциплина.');
  if (!['lecture', 'seminar', 'lab'].includes(c.type)) problems.push('Видът трябва да е лекция, семинар или упражнение.');
  if (!Number.isInteger(c.day) || c.day < 1 || c.day > 6) problems.push('Денят трябва да е от понеделник до събота.');
  if (!STARTS.includes(c.startsAt)) problems.push(`Началото ${c.startsAt} не е начало на учебен час.`);
  if (!ENDS.includes(c.endsAt) || c.endsAt <= c.startsAt) problems.push(`Краят ${c.endsAt} не е край на учебен час след началото.`);
  if (!c.room.trim()) problems.push('Липсва зала.');
  if (!Number.isInteger(c.startWeek) || c.startWeek < 1 || c.startWeek > LAST_WEEK) problems.push('Началната седмица е извън 1–15.');
  if (!c.groups.length) problems.push('Липсва група.');
  if (new Set(c.groups.map((g) => g.name)).size < c.groups.length) problems.push('Група се повтаря в едно занятие.');
  for (const g of c.groups) {
    if (!isGroupName(g.name)) problems.push(`Група „${g.name}“ трябва да е от букви и цифри, най-много 3 цифри (като 222, 221а или КСИ1).`);
    if (!['all', 'odd', 'even'].includes(g.parity)) problems.push(`Група ${g.name} е без четна/нечетна седмица.`);
  }
  return problems;
}


/** Whatever JSON the model returned, as draft classes. Wrong fields stay wrong, so the check flags them. */
export function toDraft(output: unknown): DraftClass[] {
  const list = Array.isArray(output) ? output : (output as { classes?: unknown })?.classes;
  if (!Array.isArray(list)) throw new ModelOutputError('no classes');
  return list.map((c) => ({
    course: String(c?.course ?? '').trim(),
    type: String(c?.type ?? ''),
    day: Number(c?.day),
    startsAt: String(c?.startsAt ?? '').padStart(5, '0'),
    endsAt: String(c?.endsAt ?? '').padStart(5, '0'),
    room: String(c?.room ?? '').replace(/^(зала|room)\s*/i, '').trim(),
    startWeek: Number(c?.startWeek ?? 1),
    groups: Array.isArray(c?.groups) ? c.groups.map((g: any) => ({ name: String(g?.name ?? ''), parity: g?.parity ?? 'all' })) : [],
  }));
}

export type StartImport = { sourceUrl?: string; image?: Buffer; imageType?: string; instructions?: string };

/** Queues an import of a timetable into a plan, from a page, a photo or both. Owner or admin only;
 *  the model runs later, in the worker. */
export async function startImport(actor: Actor | null, planId: number, input: StartImport): Promise<Import> {
  const { actor: me } = await editablePlan(actor, planId);
  const url = input.sourceUrl?.trim() || null;
  const image = input.image?.length ? input.image : null;
  if (!url && !image) throw new AppError(400, 'Посочете адрес на страница, снимка или и двете.');
  if (url && !/^https?:\/\/\S+$/.test(url)) throw new AppError(400, 'Адресът трябва да започва с http:// или https://.');
  if (url && !isPublicUrl(url)) throw new AppError(400, 'Адресът трябва да е публична страница в интернет.');
  if (image && !IMAGE_TYPES.includes(input.imageType ?? '')) throw new AppError(400, 'Снимката трябва да е PNG, JPEG или WebP.');
  if (image && image.length > MAX_IMAGE_BYTES) throw new AppError(400, 'Снимката трябва да е до 10 MB.');
  if ((await listImportRows(planId)).some((i) => i.status === 'queued' || i.status === 'processing')) {
    throw new AppError(409, 'Предишното внасяне още се обработва. Изчакайте го.');
  }
  const instructions = (input.instructions ?? '').trim().slice(0, 1000);
  return insertImport(planId, { sourceUrl: url, image, imageType: image ? input.imageType! : null, instructions }, me.id);
}

export async function listImports(actor: Actor | null, planId: number): Promise<Import[]> {
  await editablePlan(actor, planId);
  return listImportRows(planId);
}

/** An import, if the actor may change the plan it belongs to. */
async function loadImport(actor: Actor | null, id: number): Promise<Import> {
  const found = Number.isInteger(id) ? await findImport(id) : null;
  if (!found) throw new AppError(404, 'Внасянето не е намерено.');
  await editablePlan(actor, found.planId);
  return found;
}

/** An import with every draft class checked against the 14 periods and the TU group numbers. */
/** The photo an import was started with, for whoever may change the plan. */
export async function getImportImage(actor: Actor | null, id: number): Promise<{ data: Buffer; type: string }> {
  await loadImport(actor, id);
  const image = await findImportImage(id);
  if (!image) throw new AppError(404, 'Внасянето няма снимка.');
  return image;
}

export async function getImport(actor: Actor | null, id: number): Promise<ImportForReview> {
  const found = await loadImport(actor, id);
  const draft = (found.draft ?? []).map((c) => ({ ...c, problems: checkDraftClass(c) }));
  const canPublish = found.status === 'ready' && draft.length > 0 && draft.every((c) => c.problems.length === 0);
  return { ...found, draft, canPublish };
}

async function loadReady(actor: Actor | null, id: number): Promise<Import & { draft: DraftClass[] }> {
  const found = await loadImport(actor, id);
  if (found.status !== 'ready' || !found.draft) throw new AppError(400, 'Това внасяне не чака преглед.');
  return found as Import & { draft: DraftClass[] };
}

/** Removes one class from the draft, for instance one the model read wrong. */
export async function removeDraftClass(actor: Actor | null, id: number, index: number): Promise<void> {
  const found = await loadReady(actor, id);
  if (!Number.isInteger(index) || index < 0 || index >= found.draft.length) throw new AppError(404, 'Занятието не е намерено.');
  await updateImport(id, 'ready', { draft: found.draft.filter((_, i) => i !== index) });
}

/** Publishes the draft into the plan: only now are rows written to entries. Refused while any class is invalid. */
export async function publishImport(actor: Actor | null, id: number): Promise<void> {
  const found = await loadReady(actor, id);
  if (found.draft.length === 0 || found.draft.some((c) => checkDraftClass(c).length > 0)) {
    throw new AppError(400, 'Поправете или премахнете невалидните занятия преди публикуване.');
  }
  // Published only once: a second press, or one racing a removal, finds the import no longer ready.
  if (!(await publishDraft(id, found.planId, found.draft))) throw new AppError(400, 'Това внасяне не чака преглед.');
}

/** Puts a failed import back in the queue. */
export async function retryImport(actor: Actor | null, id: number): Promise<void> {
  if ((await loadImport(actor, id)).status !== 'failed') throw new AppError(400, 'Само неуспешно внасяне може да се опита отново.');
  await updateImport(id, 'queued');
}

/** Section ids and headings that start a list of students: everything from there on is dropped. */
const STUDENT_SECTION = /<[^>]+\bid="[^"]*(?:students?|studenti|spisak)"|<(?:h[1-6]|summary|caption|legend)\b[^>]*>(?:\s|<[^>]+>)*(?:списъчен състав|списък на студент|student list)/i;
const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", bdquo: '"', ldquo: '"', rdquo: '"', laquo: '"', raquo: '"', ndash: '–', mdash: '–', middot: '·', hellip: '…' };
const MAX_TEXT = 50_000;

/**
 * The readable text of any web page, for the model: it does not depend on how a particular site is
 * built. Code, styles, menus, headers and footers go; table cells become "a | b" and table rows,
 * paragraphs and list items become lines, so a timetable keeps its shape. Personal data the model does
 * not need goes too: a student list section (by its id or heading), e-mail addresses, phone numbers and
 * faculty numbers.
 */
export function pageText(html: string): string {
  let page = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|head|nav|header|footer|iframe|form)\b[\s\S]*?<\/\1>/gi, ' ');
  const students = page.search(STUDENT_SECTION);
  if (students !== -1) page = page.slice(0, students);
  const text = page
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<br\s*\/?>|<\/(?:tr|p|div|li|dt|dd|h[1-6]|table|section|article|summary|caption)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (all, name: string) => ENTITIES[name.toLowerCase()] ?? all)
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, ' ')
    .replace(/(?:\+359|\b0)[\s/-]?\d(?:[\s/-]?\d){7,9}\b/g, ' ')
    .replace(/\b\d{6,}\b/g, ' ');
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').replace(/^[\s|]+|[\s|]+$/g, '').replace(/(?:\s*\|\s*){2,}/g, ' | '))
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_TEXT);
}

const MAX_PAGE_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

/** An address in this machine or its network: the worker runs on the owner's laptop (with the model on
 *  localhost) and on the website's server, so a page address must never reach either. */
export function isPrivateAddress(ip: string): boolean {
  // An IPv4 address written as IPv6 ("::ffff:127.0.0.1", which URL turns into "::ffff:7f00:1"): check the IPv4 inside.
  const hex = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  const v4 = hex
    ? [parseInt(hex[1], 16) >> 8, parseInt(hex[1], 16) & 255, parseInt(hex[2], 16) >> 8, parseInt(hex[2], 16) & 255].join('.')
    : ip.replace(/^::(?:ffff:)?(?=\d+\.)/i, '');
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const v6 = ip.toLowerCase();
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

/** A public http(s) address by its shape; the worker also checks where its name points before it connects. */
export function isPublicUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    const host = hostname.replace(/^\[|\]$/g, '');
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    if (host === 'localhost' || /\.(?:localhost|local|internal|lan|home)$/i.test(host) || !host.includes('.') && !isIP(host)) return false;
    return !isIP(host) || !isPrivateAddress(host);
  } catch {
    return false;
  }
}

/** The page could not be read. */
class PageError extends Error {}

/** Reads a public page: at most 3 redirects, each checked again; 20 seconds; at most 2 MB; HTML or text only. Replaced in tests. */
export async function fetchPage(url: string, resolve: (host: string) => Promise<string[]> = lookupAll): Promise<string> {
  let address = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isPublicUrl(address)) throw new Error('not a public address');
    const host = new URL(address).hostname.replace(/^\[|\]$/g, '');
    if (!isIP(host) && (await resolve(host)).some(isPrivateAddress)) throw new Error('the name points into a private network');
    const response = await fetch(address, { signal: AbortSignal.timeout(20_000), redirect: 'manual' });
    const next = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && next) {
      address = new URL(next, address).toString();
      continue;
    }
    if (!response.ok) throw new Error(`page answered ${response.status}`);
    const type = response.headers.get('content-type') ?? '';
    if (type && !/text\/html|text\/plain|application\/xhtml/i.test(type)) throw new Error(`not a web page (${type})`);
    return readAtMost(response, MAX_PAGE_BYTES);
  }
  throw new Error('too many redirects');
}

/** Every address a host name points to. */
export const lookupAll = async (host: string) => (await lookup(host, { all: true })).map((a) => a.address);

/** The body as text, stopping after max bytes, so a huge page is never held in memory. */
async function readAtMost(response: Response, max: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel();
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, max));
}

/** Why an import failed, for the publisher. */
function failureMessage(error: unknown): string {
  if (error instanceof ModelTimeoutError) return TIMEOUT_MESSAGE;
  if (error instanceof ModelOutputError) return 'Моделът върна неразбираем отговор. Опитайте отново или въведете занятията ръчно.';
  if (error instanceof PageError) return 'Страницата не може да бъде изтеглена (не отговаря, не е уеб страница или е във вътрешна мрежа). Проверете адреса или качете снимка.';
  return 'Моделът не е достъпен. Опитайте отново по-късно или въведете занятията ръчно.';
}


/**
 * The worker's job: takes the next queued import, has the model read it, and stores the draft
 * (status ready) or the reason (status failed). Runs only in src/worker, never in a request,
 * so it has no actor: the publisher who queued the import was checked by startImport.
 */
export async function processNextImport(model: ModelClient, getPage = fetchPage, waitSeconds = 0): Promise<ImportJob | null> {
  const job = await claimNextImport(waitSeconds);
  if (!job) return null;
  try {
    let text: string | undefined;
    if (job.sourceUrl) text = pageText(await getPage(job.sourceUrl).catch((e) => Promise.reject(new PageError(e.message))));
    const image = job.image ? { data: job.image, type: job.imageType! } : undefined;
    const output = await model.readSchedule({ text, image, instructions: job.instructions });
    await updateImport(job.id, 'ready', { draft: toDraft(output), error: null });
  } catch (error) {
    await updateImport(job.id, 'failed', { error: failureMessage(error) });
  }
  return job;
}
