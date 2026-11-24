import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/src/auth';

// Sign-up, sign-in and sign-out: /api/auth/sign-up/email, /api/auth/sign-in/email, /api/auth/sign-out.
export const { GET, POST } = toNextJsHandler(auth);
