import type { Actor } from '../auth';
import { listEntries } from '../data/entries';
import {
  claimNextImport,
  findImport,
  insertImport,
  listImports as listImportRows,
  publishDraft,
  updateImport,
  type DraftClass,
  type Import,
  type ImportJob,
} from '../data/imports';
import { ModelOutputError, ModelTimeoutError, type ModelClient } from '../model/client';
import { AppError, requirePublisher } from './errors';
import { LAST_WEEK } from './schedule';

export const ONLY_PUBLISHERS = 'Само публикуващ може да внася разписания.';
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
const ENDS = PERIODS.map((p) => p[1]);

export type CheckedClass = DraftClass & { problems: string[] };
export type ImportForReview = Omit<Import, 'draft'> & { draft: CheckedClass[]; canPublish: boolean };

/** Why a draft class cannot be published, in words a publisher can act on. Empty means valid. */
export function checkDraftClass(c: DraftClass, groups: string[]): string[] {
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
    if (!groups.includes(g.name)) problems.push(`Група ${g.name} не съществува в разписанието.`);
    if (!['all', 'odd', 'even'].includes(g.parity)) problems.push(`Група ${g.name} е без четна/нечетна седмица.`);
  }
  return problems;
}

/** The groups that exist in the published schedule. */
async function knownGroups(): Promise<string[]> {
  return [...new Set((await listEntries()).flatMap((e) => e.groups.map((g) => g.name)))];
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
    room: String(c?.room ?? '').trim(),
    startWeek: Number(c?.startWeek ?? 1),
    groups: Array.isArray(c?.groups) ? c.groups.map((g: any) => ({ name: String(g?.name ?? ''), parity: g?.parity ?? 'all' })) : [],
  }));
}

export type StartImport = { sourceUrl?: string; image?: Buffer; imageType?: string; instructions?: string };

/** Queues an import from a page or a photo. Publishers only; the model runs later, in the worker. */
export async function startImport(actor: Actor | null, input: StartImport): Promise<Import> {
  const publisher = requirePublisher(actor, ONLY_PUBLISHERS);
  const url = input.sourceUrl?.trim() || null;
  const image = input.image?.length ? input.image : null;
  if (Boolean(url) === Boolean(image)) throw new AppError(400, 'Посочете или адрес на страница, или снимка.');
  if (url && !/^https?:\/\/\S+$/.test(url)) throw new AppError(400, 'Адресът трябва да започва с http:// или https://.');
  if (image && !IMAGE_TYPES.includes(input.imageType ?? '')) throw new AppError(400, 'Снимката трябва да е PNG, JPEG или WebP.');
  if (image && image.length > MAX_IMAGE_BYTES) throw new AppError(400, 'Снимката трябва да е до 10 MB.');
  const instructions = (input.instructions ?? '').trim().slice(0, 1000);
  return insertImport({ sourceUrl: url, image, imageType: image ? input.imageType! : null, instructions }, publisher.id);
}

export async function listImports(actor: Actor | null): Promise<Import[]> {
  requirePublisher(actor, ONLY_PUBLISHERS);
  return listImportRows();
}

async function loadImport(id: number): Promise<Import> {
  const found = Number.isInteger(id) ? await findImport(id) : null;
  if (!found) throw new AppError(404, 'Внасянето не е намерено.');
  return found;
}

/** An import with every draft class checked against the 14 periods and the existing groups. */
export async function getImport(actor: Actor | null, id: number): Promise<ImportForReview> {
  requirePublisher(actor, ONLY_PUBLISHERS);
  const found = await loadImport(id);
  const groups = await knownGroups();
  const draft = (found.draft ?? []).map((c) => ({ ...c, problems: checkDraftClass(c, groups) }));
  const canPublish = found.status === 'ready' && draft.length > 0 && draft.every((c) => c.problems.length === 0);
  return { ...found, draft, canPublish };
}

async function loadReady(id: number): Promise<Import & { draft: DraftClass[] }> {
  const found = await loadImport(id);
  if (found.status !== 'ready' || !found.draft) throw new AppError(400, 'Това внасяне не чака преглед.');
  return found as Import & { draft: DraftClass[] };
}

/** Removes one class from the draft, for instance one the model read wrong. */
export async function removeDraftClass(actor: Actor | null, id: number, index: number): Promise<void> {
  requirePublisher(actor, ONLY_PUBLISHERS);
  const found = await loadReady(id);
  if (!Number.isInteger(index) || index < 0 || index >= found.draft.length) throw new AppError(404, 'Занятието не е намерено.');
  await updateImport(id, 'ready', { draft: found.draft.filter((_, i) => i !== index) });
}

/** Publishes the draft: only now are rows written to entries. Refused while any class is invalid. */
export async function publishImport(actor: Actor | null, id: number): Promise<void> {
  requirePublisher(actor, ONLY_PUBLISHERS);
  const found = await loadReady(id);
  const groups = await knownGroups();
  if (found.draft.length === 0 || found.draft.some((c) => checkDraftClass(c, groups).length > 0)) {
    throw new AppError(400, 'Поправете или премахнете невалидните занятия преди публикуване.');
  }
  // Published only once: a second press, or one racing a removal, finds the import no longer ready.
  if (!(await publishDraft(id, found.draft))) throw new AppError(400, 'Това внасяне не чака преглед.');
}

/** Puts a failed import back in the queue. */
export async function retryImport(actor: Actor | null, id: number): Promise<void> {
  requirePublisher(actor, ONLY_PUBLISHERS);
  if ((await loadImport(id)).status !== 'failed') throw new AppError(400, 'Само неуспешно внасяне може да се опита отново.');
  await updateImport(id, 'queued');
}

/** The text of a schedule page, without markup and without the student lists ("Списъчен състав"). */
export function pageText(html: string): string {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
  const lists = text.search(/списъчен състав/i);
  return (lists === -1 ? text : text.slice(0, lists)).slice(0, 30_000);
}

/** The schedule page could not be read. */
class PageError extends Error {}

/** Reads a page with a time limit. Replaced in tests. */
export async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`page answered ${response.status}`);
  return response.text();
}

/** Why an import failed, for the publisher. */
function failureMessage(error: unknown): string {
  if (error instanceof ModelTimeoutError) return TIMEOUT_MESSAGE;
  if (error instanceof ModelOutputError) return 'Моделът върна неразбираем отговор. Опитайте отново или въведете занятията ръчно.';
  if (error instanceof PageError) return 'Страницата не може да бъде изтеглена. Проверете адреса.';
  return 'Моделът не е достъпен. Опитайте отново по-късно или въведете занятията ръчно.';
}


/**
 * The worker's job: takes the next queued import, has the model read it, and stores the draft
 * (status ready) or the reason (status failed). Runs only in src/worker, never in a request,
 * so it has no actor: the publisher who queued the import was checked by startImport.
 */
export async function processNextImport(model: ModelClient, getPage = fetchPage): Promise<ImportJob | null> {
  const job = await claimNextImport();
  if (!job) return null;
  try {
    let text: string | undefined;
    if (job.sourceUrl) text = pageText(await getPage(job.sourceUrl).catch((e) => Promise.reject(new PageError(e.message))));
    const image = job.image ? { data: job.image, type: job.imageType! } : undefined;
    const output = await model.readSchedule({ text, image, instructions: job.instructions, groups: await knownGroups() });
    await updateImport(job.id, 'ready', { draft: toDraft(output), error: null });
  } catch (error) {
    await updateImport(job.id, 'failed', { error: failureMessage(error) });
  }
  return job;
}
