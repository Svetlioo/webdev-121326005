import type { Actor } from '../auth';
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
/** A TU Sofia group number: three digits and maybe a letter, such as 222 or 221а. */
const GROUP = /^\d{3}[а-яa-z]?$/i;
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
    if (!GROUP.test(g.name)) problems.push(`Група „${g.name}“ не е номер на група в ТУ (като 222 или 221а).`);
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
    room: String(c?.room ?? '').trim(),
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
  if (url && !isTuSofiaPage(url)) throw new AppError(400, 'Може да се внася само страница на ТУ София (tu-sofia.bg или fcst.bg).');
  if (image && !IMAGE_TYPES.includes(input.imageType ?? '')) throw new AppError(400, 'Снимката трябва да е PNG, JPEG или WebP.');
  if (image && image.length > MAX_IMAGE_BYTES) throw new AppError(400, 'Снимката трябва да е до 10 MB.');
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

/**
 * The text of a schedule page, without markup and without the student lists ("Списъчен състав").
 * Menus go first, because a tab called "Списъчен състав" can come before the timetable; then the
 * page is cut where the student list starts: its section (an id with "student"), or its heading.
 */
export function pageText(html: string): string {
  let page = html.replace(/<(script|style|nav)\b[\s\S]*?<\/\1>/gi, ' ');
  const section = page.search(/<[^>]+\bid="[^"]*student/i);
  if (section !== -1) page = page.slice(0, section);
  const text = page
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[bl]dquo;/g, '"')
    .replace(/&[nm]dash;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
  const lists = text.search(/списъчен състав/i);
  return (lists === -1 ? text : text.slice(0, lists)).slice(0, 30_000);
}

/**
 * The worker fetches the page on the owner's laptop, so the address must be a TU Sofia site: never an
 * address in the home network or the laptop itself (such as the model server on localhost).
 */
function isTuSofiaPage(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ['tu-sofia.bg', 'fcst.bg'].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

const MAX_PAGE_CHARS = 2_000_000;

/** The schedule page could not be read. */
class PageError extends Error {}

/** Reads a page with a time limit. Replaced in tests. */
export async function fetchPage(url: string): Promise<string> {
  // No redirects: a TU Sofia address must not lead the worker on to another host.
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'error' });
  if (!response.ok) throw new Error(`page answered ${response.status}`);
  return (await response.text()).slice(0, MAX_PAGE_CHARS);
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
    const output = await model.readSchedule({ text, image, instructions: job.instructions });
    await updateImport(job.id, 'ready', { draft: toDraft(output), error: null });
  } catch (error) {
    await updateImport(job.id, 'failed', { error: failureMessage(error) });
  }
  return job;
}
