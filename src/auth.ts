import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import { db } from './data/db';

// Better Auth owns sign-up, sign-in, sessions and password hashing (scrypt), and writes
// its own tables: user, session, account, verification. See SPEC.md, Auth.
export function createAuth(database: Parameters<typeof betterAuth>[0]['database']) {
  return betterAuth({
    database,
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    user: {
      additionalFields: {
        // Set only by `npm run make-publisher`, never by the person signing up.
        role: { type: 'string', required: false, defaultValue: 'student', input: false },
      },
    },
    // Lecture 7: Google is linked only by a signed-in user (linkSocial), never by email alone.
    account: { accountLinking: { disableImplicitLinking: true } },
    // `Authorization: Bearer <session token>` is read like the session cookie. The MCP server
    // signs in this way with MCP_TOKEN, so it is checked against the same session table.
    plugins: [bearer()],
  });
}

export const auth = createAuth(db());

export type Actor = { id: string; role: string };

type Auth = ReturnType<typeof createAuth>;

/** The signed-in user for a request's headers (cookie or bearer token), or null. */
export async function actorFromHeaders(headers: Headers, from: Auth = auth): Promise<Actor | null> {
  const session = await from.api.getSession({ headers });
  return session ? { id: session.user.id, role: session.user.role ?? 'student' } : null;
}

/** The user an MCP_TOKEN belongs to, or null when it is missing, wrong or expired. */
export function actorFromToken(token: string | undefined, from: Auth = auth): Promise<Actor | null> {
  if (!token) return Promise.resolve(null);
  return actorFromHeaders(new Headers({ authorization: `Bearer ${token}` }), from);
}
