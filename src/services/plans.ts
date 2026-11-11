import type { Actor } from '../auth';
import { listEntries } from '../data/entries';
import {
  addShare,
  claimNextPlan,
  deletePlan as deletePlanRow,
  deleteSource,
  findPlan,
  findSourceImage,
  insertMessage,
  insertPlan,
  insertSource,
  isSharedWith,
  listMessages,
  listPlansFor,
  listShares,
  listSourceImages,
  listSources,
  removeShare,
  saveWindows,
  setModelStatus,
  type Message,
  type Plan,
  type Share,
  type Source,
} from '../data/plans';
import { findUserIdByEmail } from '../data/users';
import type { ModelClient } from '../model/client';
import { planAnswer } from '../model/schemas';
import { AppError, requireActor } from './errors';
import { getWeek, type WeekClass } from './schedule';
import { labelClass, parseWindows, type Label } from './windows';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ONLY_OWNER = 'Само собственикът може да променя тази програма.';

export type LabelledClass = WeekClass & { label: Label | null; reason: string };
export type PlanView = {
  plan: Plan;
  isOwner: boolean;
  sources: Source[];
  messages: Message[];
  shares: Share[];
  classes: LabelledClass[];
};

/** The plan, if the actor may read it: its owner, or someone it is shared with. Anyone else gets 403. */
async function readable(actor: Actor | null, id: number): Promise<{ plan: Plan; isOwner: boolean; actor: Actor }> {
  const me = requireActor(actor);
  const plan = Number.isInteger(id) ? await findPlan(id) : null;
  if (!plan) throw new AppError(404, 'Програмата не е намерена.');
  const isOwner = plan.ownerId === me.id;
  if (!isOwner && !(await isSharedWith(id, me.id))) throw new AppError(403, 'Тази програма не е споделена с вас.');
  return { plan, isOwner, actor: me };
}

/** The plan, if the actor owns it. A reader or anyone else gets 403. */
async function owned(actor: Actor | null, id: number): Promise<Plan> {
  const { plan, isOwner } = await readable(actor, id);
  if (!isOwner) throw new AppError(403, ONLY_OWNER);
  return plan;
}

/** Reads the windows from the instructions and messages at once, and queues the plan for the model. */
async function recompute(planId: number): Promise<void> {
  const texts = (await listSources(planId)).flatMap((s) => (s.text ? [s.text] : []));
  const said = (await listMessages(planId)).filter((m) => m.role === 'user').map((m) => m.content);
  await saveWindows(planId, parseWindows([...texts, ...said]), 'parser', 'queued');
}

export async function listMyPlans(actor: Actor | null): Promise<{ own: Plan[]; shared: Plan[] }> {
  return listPlansFor(requireActor(actor).id);
}

export async function createPlan(actor: Actor | null, input: { name: string; group: string }): Promise<number> {
  const me = requireActor(actor);
  const name = input.name.trim();
  if (name.length < 1 || name.length > 100) throw new AppError(400, 'Името трябва да е между 1 и 100 знака.');
  const groups = new Set((await listEntries()).flatMap((e) => e.groups.map((g) => g.name)));
  if (!groups.has(input.group)) throw new AppError(400, 'Изберете група от разписанието.');
  return insertPlan(me.id, name, input.group);
}

/** Everything the plan page shows: sources, chat, shares (owner only) and the week with a label on every class. */
export async function getPlan(actor: Actor | null, id: number, week: number): Promise<PlanView> {
  const { plan, isOwner, actor: me } = await readable(actor, id);
  const classes = (await getWeek(me, plan.groupName, week)).map((c) =>
    c.cancelled ? { ...c, label: null, reason: 'Занятието е отменено.' } : { ...c, ...labelClass(c, plan.windows) },
  );
  return {
    plan,
    isOwner,
    sources: await listSources(id),
    messages: await listMessages(id),
    shares: isOwner ? await listShares(id) : [],
    classes,
  };
}

export type NewSource = { text?: string; image?: Buffer; imageType?: string };

/** Adds an instruction or a photo. Owner only. The plan is recomputed at once and queued for the model. */
export async function addSource(actor: Actor | null, id: number, input: NewSource): Promise<void> {
  await owned(actor, id);
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
  await owned(actor, id);
  if (!Number.isInteger(sourceId) || !(await deleteSource(id, sourceId))) throw new AppError(404, 'Източникът не е намерен.');
  await recompute(id);
}

/** A photo of the plan, for its owner and readers. */
export async function getSourceImage(actor: Actor | null, id: number, sourceId: number): Promise<{ data: Buffer; type: string }> {
  await readable(actor, id);
  const image = Number.isInteger(sourceId) ? await findSourceImage(id, sourceId) : null;
  if (!image) throw new AppError(404, 'Снимката не е намерена.');
  return image;
}

/** A chat message to the model. Owner only. */
export async function sendMessage(actor: Actor | null, id: number, text: string): Promise<void> {
  await owned(actor, id);
  const content = text.trim();
  if (content.length < 1 || content.length > 2000) throw new AppError(400, 'Съобщението трябва да е между 1 и 2000 знака.');
  await insertMessage(id, 'user', content);
  await recompute(id);
}

/** Shares the plan, read-only, with another user by email. Owner only. */
export async function sharePlan(actor: Actor | null, id: number, email: string): Promise<void> {
  const plan = await owned(actor, id);
  const userId = await findUserIdByEmail(email);
  if (!userId) throw new AppError(404, 'Няма потребител с този имейл.');
  if (userId === plan.ownerId) throw new AppError(400, 'Програмата вече е ваша.');
  await addShare(id, userId);
}

export async function unsharePlan(actor: Actor | null, id: number, userId: string): Promise<void> {
  await owned(actor, id);
  await removeShare(id, userId);
}

export async function deletePlan(actor: Actor | null, id: number): Promise<void> {
  await owned(actor, id);
  await deletePlanRow(id);
}

/**
 * The worker's job for plans: takes the next queued plan, asks the model for the busy windows
 * (structured output), checks the answer against the schema and saves it. A wrong answer, a timeout
 * or no model leaves the parser's windows in place and marks the plan failed. No actor: the owner
 * was checked when the plan was queued.
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
    await insertMessage(id, 'assistant', answer.data.reply);
    await saveWindows(id, answer.data.windows, 'model', 'idle');
  } catch {
    await setModelStatus(id, 'failed');
  }
  return id;
}
