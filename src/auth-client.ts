import { createAuthClient } from 'better-auth/react';

// The browser side of Better Auth: talks to /api/auth/* on the same origin.
export const authClient = createAuthClient();
