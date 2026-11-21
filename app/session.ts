import { headers } from 'next/headers';
import { actorFromHeaders, type Actor } from '@/src/auth';
import { AppError } from '@/src/services/errors';

/** The signed-in user for this request, checked against the session table, or null. */
export async function getActor(): Promise<Actor | null> {
  return actorFromHeaders(await headers());
}

/** A body over 11 MB (a 10 MB photo and the form around it) is refused before it is read into memory. */
export function tooLarge(request: Request): Response | null {
  if (Number(request.headers.get('content-length') ?? 0) <= 11 * 1024 * 1024) return null;
  return Response.json({ error: 'Файлът е твърде голям: до 10 MB.' }, { status: 413 });
}

/** Turns a service refusal into a JSON error; anything else is logged and hidden. */
export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.status });
  console.error(error);
  return Response.json({ error: 'Нещо се обърка. Опитайте отново.' }, { status: 500 });
}
