// A student's plan: their own timetable, their sources (instructions and photos), a chat with the
// model, and who else may read it. Access rules are in src/services/access.ts.
import type { Actor } from '../auth';
import { insertEntries } from '../data/entries';
import {
  addShare,
  claimNextPlan,
  deletePlan as deletePlanRow,
  deleteSource,
  finishPlan,
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
  type Message,
  type Plan,
  type Share,
  type Source,
} from '../data/plans';
import { sampleTimetable } from '../data/templates';
import { findUserIdByEmail } from '../data/users';
import type { ModelClient } from '../model/client';
import { planAnswer } from '../model/schemas';
import { editablePlan, isAdmin, readablePlan } from './access';
import { AppError, requireActor } from './errors';
import { getWeek, type WeekClass } from './schedule';
import { labelClass, parseWindows, type Label } from './windows';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
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
  classes: LabelledClass[];
};

/** Reads the windows from the instructions and messages at once, and queues the plan for the model. */
async function recompute(planId: number): Promise<void> {
  const texts = (await listSources(planId)).flatMap((s) => (s.text ? [s.text] : []));
  const said = (await listMessages(planId)).filter((m) => m.role === 'user').map((m) => m.content);
  await saveWindows(planId, parseWindows([...texts, ...said]), 'parser', 'queued');
}

/** The user's plans and the ones shared with them; an admin also sees everyone else's. */
export async function listMyPlans(actor: Actor | null): Promise<{ own: Plan[]; shared: Plan[]; others: Plan[] }> {
  const me = requireActor(actor);
  const { own, shared } = await listPlansFor(me.id);
  return { own, shared, others: isAdmin(me) ? await listOtherPlans(me.id) : [] };
}

export type NewPlan = { name: string; group: string; fromSample?: boolean };

/** A new plan for the actor. It starts empty (the student imports their timetable) or from the sample timetable. */
export async function createPlan(actor: Actor | null, input: NewPlan): Promise<number> {
  const me = requireActor(actor);
  const name = input.name.trim();
  const group = input.group.trim();
  if (name.length < 1 || name.length > 100) throw new AppError(400, 'Името трябва да е между 1 и 100 знака.');
  if (!GROUP.test(group)) throw new AppError(400, 'Групата е номер като 222 или 221а.');
  const id = await insertPlan(me.id, name, group);
  if (input.fromSample) await insertEntries(id, await sampleTimetable());
  return id;
}

/** Everything the plan page shows: sources, chat, shares (owner only) and the week with a label on every class. */
export async function getPlan(actor: Actor | null, id: number, week: number): Promise<PlanView> {
  const { plan, isOwner, canEdit, actor: me } = await readablePlan(actor, id);
  const classes = (await getWeek(me, id, week)).map((c) =>
    c.cancelled ? { ...c, label: null, reason: 'Занятието е отменено.' } : { ...c, ...labelClass(c, plan.windows) },
  );
  return {
    plan,
    isOwner,
    canEdit,
    sources: await listSources(id),
    messages: await listMessages(id),
    shares: canEdit ? await listShares(id) : [],
    classes,
  };
}

export type NewSource = { text?: string; image?: Buffer; imageType?: string };

/** Adds an instruction or a photo. Owner or admin. The plan is recomputed at once and queued for the model. */
export async function addSource(actor: Actor | null, id: number, input: NewSource): Promise<void> {
  await editablePlan(actor, id);
  const text = input.text?.trim() || null;
  const image = input.image?.length ? input.image : null;
  if (Boolean(text) === Boolean(image)) throw new AppError(400, 'Добавете или инструкция, или снимка.');
  if (text && text.length > 1000) throw new AppError(400, 'Инструкцията трябва да е до 1000 знака.');
  if (image && !IMAGE_TYPES.includes(input.imageType ?? '')) throw new AppError(400, 'Снимката трябва да е PNG, JPEG или WebP.');
  if (image && image.length > MAX_IMAGE_BYTES) throw new AppError(400, 'Снимката трябва да е до 10 MB.');
  await insertSource(id, text ? { text } : { image: image!, imageType: input.imageType! });
  await recompute(id);
}

export async function removeSource(actor: Actor | null, id: number, sourceId: number): Promise<void> {
  await editablePlan(actor, id);
  if (!Number.isInteger(sourceId) || !(await deleteSource(id, sourceId))) throw new AppError(404, 'Източникът не е намерен.');
  await recompute(id);
}

/** A photo of the plan, for everyone who may read it. */
export async function getSourceImage(actor: Actor | null, id: number, sourceId: number): Promise<{ data: Buffer; type: string }> {
  await readablePlan(actor, id);
  const image = Number.isInteger(sourceId) ? await findSourceImage(id, sourceId) : null;
  if (!image) throw new AppError(404, 'Снимката не е намерена.');
  return image;
}

/** A chat message to the model. Owner or admin. */
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
  if (!userId) throw new AppError(404, 'Няма потребител с този имейл.');
  if (userId === plan.ownerId) throw new AppError(400, 'Програмата вече е на този потребител.');
  await addShare(id, userId);
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
 * The worker's job for plans: takes the next queued plan, asks the model for the busy windows
 * (structured output), checks the answer against the schema and saves it. A wrong answer, a timeout
 * or no model leaves the parser's windows in place and marks the plan failed. The result is saved
 * only if nobody changed the plan meanwhile; otherwise the plan stays queued for the next round.
 * No actor: the owner was checked when the plan was queued.
 */
export async function processNextPlan(model: ModelClient): Promise<number | null> {
  const id = await claimNextPlan();
  if (id === null) return null;
  const messages = await listMessages(id);
  try {
    const output = await model.readPlan({
      instructions: (await listSources(id)).flatMap((s) => (s.text ? [s.text] : [])),
      images: await listSourceImages(id),
      messages: messages.map(({ role, content }) => ({ role, content })),
    });
    const answer = planAnswer.safeParse(output);
    if (!answer.success) throw new Error('the answer does not match the schema');
    if (await finishPlan(id, answer.data.windows)) await insertMessage(id, 'assistant', answer.data.reply);
  } catch {
    await finishPlan(id, null);
  }
  return id;
}
