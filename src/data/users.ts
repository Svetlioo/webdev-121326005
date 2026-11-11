import { db } from './db';

/** Makes a user a publisher. Returns whether a user with that email exists. */
export async function setRole(email: string, role: 'student' | 'publisher'): Promise<boolean> {
  const { rowCount } = await db().query('UPDATE "user" SET role = $1 WHERE email = $2', [role, email.toLowerCase()]);
  return rowCount === 1;
}
