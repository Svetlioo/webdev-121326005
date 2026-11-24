// Who may do what with a plan. Everything a student has lives in a plan, so this is the one place
// the app decides access: the owner and an admin may change a plan; someone it is shared with may
// only read it (and gets 403 for a change); for anyone else the plan does not exist (404, the same
// answer as for a plan that really does not exist, so ids reveal nothing); nobody signed in gets 401.
import type { Actor } from '../auth';
import { findPlan, isSharedWith, type Plan } from '../data/plans';
import { AppError, requireActor } from './errors';

const NOT_FOUND = 'Програмата не е намерена.';

export const isAdmin = (actor: Actor | null) => actor?.role === 'admin';

export type Access = { plan: Plan; actor: Actor; isOwner: boolean; canEdit: boolean };

/** The plan, if the actor may read it. */
export async function readablePlan(actor: Actor | null, id: number): Promise<Access> {
  const me = requireActor(actor);
  const plan = Number.isInteger(id) ? await findPlan(id) : null;
  const isOwner = plan?.ownerId === me.id;
  const canEdit = isOwner || isAdmin(me);
  if (!plan || (!canEdit && !(await isSharedWith(id, me.id)))) throw new AppError(404, NOT_FOUND);
  return { plan, actor: me, isOwner, canEdit };
}

/** The plan, if the actor may change it: its owner or an admin. A reader gets 403. */
export async function editablePlan(actor: Actor | null, id: number): Promise<Access> {
  const access = await readablePlan(actor, id);
  if (!access.canEdit) throw new AppError(403, 'Само собственикът може да променя тази програма.');
  return access;
}
