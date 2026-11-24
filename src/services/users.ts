import type { Actor } from '../auth';
import { hasGoogleAccount, listUsers as listUserRows, setRoleById, type Role, type UserRow } from '../data/users';
import { AppError, requireActor } from './errors';

const ROLES: Role[] = ['student', 'admin'];

function requireAdmin(actor: Actor | null): Actor {
  if (requireActor(actor).role !== 'admin') throw new AppError(403, 'Само администратор може да променя роли.');
  return actor as Actor;
}

/** Whether the signed-in user already signs in with Google too, so the header hides "Свържи Google". */
export async function isGoogleLinked(actor: Actor | null): Promise<boolean> {
  return hasGoogleAccount(requireActor(actor).id);
}

export async function listUsers(actor: Actor | null): Promise<UserRow[]> {
  requireAdmin(actor);
  return listUserRows();
}

/** Gives a user a role. Admins only, and never their own role, so the last admin cannot lock everyone out. */
export async function setUserRole(actor: Actor | null, userId: string, role: string): Promise<void> {
  const admin = requireAdmin(actor);
  if (!ROLES.includes(role as Role)) throw new AppError(400, 'Ролята трябва да е студент или администратор.');
  if (userId === admin.id) throw new AppError(400, 'Не можете да промените собствената си роля.');
  if (!(await setRoleById(userId, role as Role))) throw new AppError(404, 'Потребителят не е намерен.');
}
