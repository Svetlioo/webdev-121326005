// A student's plan: their own timetable, their group and subject choices, their personal instructions
// and photos, a chat with the model that may change those, and who else may read it.
// Access rules are in src/services/access.ts.
import type { Actor } from '../auth';
import { insertEntries, listEntries, type Entry } from '../data/entries';
import {
  addShare,
  applyModelAnswer,
  claimNextPlan,
  deletePlan as deletePlanRow,
  deleteSource,
  failPlan,
  findPlan,
  findSourceImage,
  insertMessage,
  insertPlan,
  insertSource,
  listMessages,
  listOtherPlans,
  listPlansFor,
  listShares,
  listSourceImages,
  listSources,
  removeShare,
  saveWindows,
  setMyGroup as saveMyGroup,
  setSubjects,
  type Message,
  type Plan,
  type Share,
  type Source,
} from '../data/plans';
import { sampleTimetable } from '../data/templates';
import { findUserIdByEmail } from '../data/users';
import type { ModelClient } from '../model/client';
import { planAnswer, type SubjectChange } from '../model/schemas';
import { editablePlan, isAdmin, readablePlan } from './access';
import { AppError, requireActor } from './errors';
import { getWeek, subjectKey, subjectsOf, type Subject, type WeekClass } from './schedule';
import { labelClass, parseWindows, type Label } from './windows';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PHOTOS = 5;
/** A TU Sofia group number: three digits and maybe a letter, such as 222 or 221а. */
const GROUP = /^\d{3}[а-яa-z]?$/i;

export type LabelledClass = WeekClass & { label: Label | null; reason: string };
export type PlanView = {
  plan: Plan;
  isOwner: boolean;
  canEdit: boolean;
  sources: Source[];
  messages: Message[];
  shares: Share[];
  subjects: Subject[];
  groups: string[];
  classes: LabelledClass[];
};

const groupsOf = (entries: Entry[]) => [...new Set(entries.flatMap((e) => e.groups.map((g) => g.name)))].sort();

/** How the chat records an instruction or photo the student removed. */
export const REMOVED = 'Махнах';

/** Reads approximate busy times at once (no AI) and queues the plan for the model: from the instructions,
 *  and from the student's last message if the model has not answered it yet (older messages are already
 *  in the instructions, or were dropped by the student). */
async function recompute(planId: number): Promise<void> {
  const sources = (await listSources(planId)).flatMap((s) => (s.text ? [s.text] : []));
  const last = (await listMessages(planId)).at(-1);
  const pending = last?.role === 'user' && !last.content.startsWith(REMOVED) ? [last.content] : [];
  const texts = [...sources, ...pending];
  await saveWindows(planId, parseWindows(texts), 'parser', 'queued');
}

/**
 * Subject changes as a new map of choices, if every one is possible: the subject is in the timetable
 * and the group has it (or the change is "not taken"). Otherwise null, and nothing may be saved.
 */
function applyChanges(entries: Entry[], plan: Plan, changes: SubjectChange[]): Record<string, string | null> | null {
  const subjects = subjectsOf(entries, plan);
  const next = { ...plan.subjects };
  for (const c of changes) {
    const subject = subjects.find((s) => s.key === subjectKey(c));
    if (!subject || (c.group !== null && !subject.groups.includes(c.group))) return null;
    next[subject.key] = c.group;
  }
  return next;
}

/** The user's plans and the ones shared with them; an admin also sees everyone else's. */
export async function listMyPlans(actor: Actor | null): Promise<{ own: Plan[]; shared: Plan[]; others: Plan[] }> {
  const me = requireActor(actor);
  const { own, shared } = await listPlansFor(me.id);
  return { own, shared, others: isAdmin(me) ? await listOtherPlans(me.id) : [] };
}

export type NewPlan = { name: string; fromSample?: boolean; myGroup?: string };

/** A new plan for the actor. It starts empty (the student imports their timetable) or from the sample
 *  timetable; the group is usually chosen afterwards, from the groups in the timetable. */
export async function createPlan(actor: Actor | null, input: NewPlan): Promise<number> {
  const me = requireActor(actor);
  const name = input.name.trim();
  if (name.length < 1 || name.length > 100) throw new AppError(400, 'Името трябва да е между 1 и 100 знака.');
  if (input.myGroup !== undefined && !GROUP.test(input.myGroup)) throw new AppError(400, 'Групата е номер като 222 или 221а.');
  const id = await insertPlan(me.id, name, input.myGroup ?? null);
  if (input.fromSample) await insertEntries(id, await sampleTimetable());
  return id;
}

/** The student's own group: one of the groups in the plan's timetable. Owner or admin. */
export async function setMyGroup(actor: Actor | null, id: number, group: string): Promise<void> {
  await editablePlan(actor, id);
  if (!groupsOf(await listEntries(id)).includes(group)) throw new AppError(400, `Група „${group}“ я няма в разписанието.`);
  await saveMyGroup(id, group);
}

/** Which group's sessions of one subject the student attends, or null for "not taken". Owner or admin. */
export async function chooseSubject(actor: Actor | null, id: number, change: SubjectChange): Promise<void> {
  const { plan } = await editablePlan(actor, id);
  const next = applyChanges(await listEntries(id), plan, [change]);
  if (!next) throw new AppError(400, `Група ${change.group} няма ${change.course} (${change.type}) в разписанието.`);
  await setSubjects(id, next);
}

/** Everything the plan page shows: instructions, chat, shares (owner only), subjects, and the week with a label on every class. */
export async function getPlan(actor: Actor | null, id: number, week: number): Promise<PlanView> {
  const { plan, isOwner, canEdit, actor: me } = await readablePlan(actor, id);
  const entries = await listEntries(id);
  const classes = (await getWeek(me, id, week)).map((c) =>
    c.cancelled
      ? { ...c, label: null, reason: 'Занятието е отменено.' }
      : c.skipped
        ? { ...c, label: null, reason: 'Не ходите на това занятие.' }
        : { ...c, ...labelClass(c, plan.windows) },
  );
  return {
    plan,
    isOwner,
    canEdit,
    sources: await listSources(id),
    messages: await listMessages(id),
    shares: canEdit ? await listShares(id) : [],
    subjects: subjectsOf(entries, plan),
    groups: groupsOf(entries),
    classes,
  };
}

export type NewSource = { text?: string; image?: Buffer; imageType?: string };

/** Adds a personal instruction or a photo. Owner or admin. Busy times are re-read at once and the plan is queued for the model. */
export async function addSource(actor: Actor | null, id: number, input: NewSource): Promise<void> {
  await editablePlan(actor, id);
  const text = input.text?.trim() || null;
  const image = input.image?.length ? input.image : null;
  if (Boolean(text) === Boolean(image)) throw new AppError(400, 'Добавете или инструкция, или снимка.');
  if (text && text.length > 1000) throw new AppError(400, 'Инструкцията трябва да е до 1000 знака.');
  if (image && !IMAGE_TYPES.includes(input.imageType ?? '')) throw new AppError(400, 'Снимката трябва да е PNG, JPEG или WebP.');
  if (image && image.length > MAX_IMAGE_BYTES) throw new AppError(400, 'Снимката трябва да е до 10 MB.');
  if (image && (await listSources(id)).filter((s) => s.imageType).length >= MAX_PHOTOS) {
    throw new AppError(400, `Програмата може да има най-много ${MAX_PHOTOS} снимки.`);
  }
  await insertSource(id, text ? { text } : { image: image!, imageType: input.imageType! });
  await recompute(id);
}

export async function removeSource(actor: Actor | null, id: number, sourceId: number): Promise<void> {
  await editablePlan(actor, id);
  const source = Number.isInteger(sourceId) ? (await listSources(id)).find((s) => s.id === sourceId) : undefined;
  if (!source || !(await deleteSource(id, sourceId))) throw new AppError(404, 'Източникът не е намерен.');
  // Said in the chat, so the model does not bring it back from an older message.
  await insertMessage(id, 'user', source.text ? `${REMOVED} „${source.text}“` : `${REMOVED} снимката.`);
  await recompute(id);
}

/** A photo of the plan, for everyone who may read it. */
export async function getSourceImage(actor: Actor | null, id: number, sourceId: number): Promise<{ data: Buffer; type: string }> {
  await readablePlan(actor, id);
  const image = Number.isInteger(sourceId) ? await findSourceImage(id, sourceId) : null;
  if (!image) throw new AppError(404, 'Снимката не е намерена.');
  return image;
}

/** A chat message to the model, which may change the instructions, the subjects and the busy times. Owner or admin. */
export async function sendMessage(actor: Actor | null, id: number, text: string): Promise<void> {
  await editablePlan(actor, id);
  const content = text.trim();
  if (content.length < 1 || content.length > 2000) throw new AppError(400, 'Съобщението трябва да е между 1 и 2000 знака.');
  await insertMessage(id, 'user', content);
  await recompute(id);
}

/** Shares the plan, read-only, with another user by email. Owner or admin. */
export async function sharePlan(actor: Actor | null, id: number, email: string): Promise<void> {
  const { plan } = await editablePlan(actor, id);
  const userId = await findUserIdByEmail(email);
  if (userId === plan.ownerId) throw new AppError(400, 'Програмата вече е на този потребител.');
  // An unknown email gets the same answer as a known one, so nobody can test who is registered.
  if (userId) await addShare(id, userId);
}

export async function unsharePlan(actor: Actor | null, id: number, userId: string): Promise<void> {
  await editablePlan(actor, id);
  await removeShare(id, userId);
}

export async function deletePlan(actor: Actor | null, id: number): Promise<void> {
  await editablePlan(actor, id);
  await deletePlanRow(id);
}

/**
 * The worker's job for plans: takes the next queued plan and asks the model (structured output) for
 * the busy times, a reply, and the changes the student asked for. The answer is checked against the
 * schema and every subject change against the timetable; anything wrong rejects the whole answer and
 * the plan keeps what it had. It is saved only if nobody changed the plan meanwhile.
 * No actor: the owner was checked when the plan was queued.
 */
export async function processNextPlan(model: ModelClient, waitSeconds = 0): Promise<number | null> {
  const id = await claimNextPlan(waitSeconds);
  if (id === null) return null;
  try {
    const plan = (await findPlan(id))!;
    const entries = await listEntries(id);
    const output = await model.readPlan({
      instructions: (await listSources(id)).flatMap((s) => (s.text ? [s.text] : [])),
      images: await listSourceImages(id),
      messages: (await listMessages(id)).map(({ role, content }) => ({ role, content })),
      myGroup: plan.myGroup,
      subjects: subjectsOf(entries, plan).map(({ course, type, groups, chosen }) => ({ course, type, groups, chosen })),
    });
    const answer = planAnswer.safeParse(output);
    if (!answer.success) throw new Error('the answer does not match the schema');
    const subjects = answer.data.subjects ? applyChanges(entries, plan, answer.data.subjects) : undefined;
    if (subjects === null) throw new Error('a subject change is not possible');
    const saved = await applyModelAnswer(id, { windows: answer.data.windows, subjects, instructions: answer.data.instructions });
    if (saved) await insertMessage(id, 'assistant', answer.data.reply);
  } catch {
    await failPlan(id);
  }
  return id;
}
