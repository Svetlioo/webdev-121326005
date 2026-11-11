import { betterAuth } from 'better-auth';
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
  });
}

export const auth = createAuth(db());

export type Actor = { id: string; role: string };
