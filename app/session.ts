import { headers } from 'next/headers';
import { auth, type Actor } from '@/src/auth';
import { AppError } from '@/src/services/errors';

/** The signed-in user for this request, checked against the session table, or null. */
export async function getActor(): Promise<Actor | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session ? { id: session.user.id, role: session.user.role ?? 'student' } : null;
}

/** Turns a service refusal into a JSON error; anything else is logged and hidden. */
export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.status });
  console.error(error);
  return Response.json({ error: 'Нещо се обърка. Опитайте отново.' }, { status: 500 });
}
