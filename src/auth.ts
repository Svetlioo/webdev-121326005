import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import { db } from './data/db';

// Better Auth owns sign-up, sign-in, sessions and password hashing (scrypt), and writes
// its own tables: user, session, account, verification. See SPEC.md, Auth.
export function createAuth(database: Parameters<typeof betterAuth>[0]['database'], env: Record<string, string | undefined> = process.env) {
  return betterAuth({
    database,
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    // Google (OAuth 2.0 / OpenID Connect with state and PKCE), only when its client is configured.
    // A returning Google user is found by Google's `sub`, never by the email.
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
        : {},
    user: {
      // An email Google has not verified is refused before anything is written: no user, no
      // account, no link. It comes back to the page as ?error=email_not_verified.
      validateUserInfo: ({ user, source }) =>
        source.method === 'oauth' && !user.emailVerified ? { error: 'email_not_verified' } : undefined,
      additionalFields: {
        // Set only by `npm run make-publisher`, never by the person signing up.
        role: { type: 'string', required: false, defaultValue: 'student', input: false },
      },
    },
    // Lecture 7: Google is linked only by a signed-in user (linkSocial), never by email alone.
    // Signing in with Google as an existing password account's email is refused (account_not_linked),
    // and linking needs Google's verified email and the same email as the account.
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
