import type { Actor } from '../auth';

/** A refusal a person can read. Route handlers turn `status` into the HTTP status code. */
export class AppError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404,
    message: string,
  ) {
    super(message);
  }
}

/** Everything in the app needs a signed-in user. */
export function requireActor(actor: Actor | null): Actor {
  if (!actor) throw new AppError(401, 'Влезте в профила си.');
  return actor;
}


