import { db } from './db';

export type Role = 'student' | 'publisher' | 'admin';
export type UserRow = { id: string; email: string; name: string; role: Role };

/** Sets a user's role by email (the make-publisher and make-admin scripts). Returns whether the user exists. */
export async function setRole(email: string, role: Role): Promise<boolean> {
  const { rowCount } = await db().query('UPDATE "user" SET role = $1 WHERE email = $2', [role, email.toLowerCase()]);
  return rowCount === 1;
}

export async function setRoleById(id: string, role: Role): Promise<boolean> {
  const { rowCount } = await db().query('UPDATE "user" SET role = $1, "updatedAt" = now() WHERE id = $2', [role, id]);
  return rowCount === 1;
}

export async function listUsers(): Promise<UserRow[]> {
  const { rows } = await db().query('SELECT id, email, name, role FROM "user" ORDER BY email');
  return rows;
}

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const { rows } = await db().query('SELECT id FROM "user" WHERE email = $1', [email.trim().toLowerCase()]);
  return rows[0]?.id ?? null;
}
