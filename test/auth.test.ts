import { describe, expect, test } from 'vitest';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { actorFromToken, createAuth } from '../src/auth';
import { authMessage } from '../src/auth-messages';

process.env.BETTER_AUTH_SECRET ??= 'test-secret-that-is-at-least-32-characters-long';

// The real Better Auth configuration from src/auth.ts, over an in-memory database.
function setup() {
  const tables = { user: [], session: [], account: [], verification: [] } as Record<string, unknown[]>;
  return { auth: createAuth(memoryAdapter(tables)), tables };
}

describe('sign-in', () => {
  test('AC-17 a wrong password is refused with "Грешен имейл или парола" and no session is created', async () => {
    const { auth, tables } = setup();
    await auth.api.signUpEmail({ body: { email: 'student@example.com', password: 'correct-horse', name: 'student' } });
    const sessionsBefore = tables.session.length;

    const attempt = auth.api.signInEmail({ body: { email: 'student@example.com', password: 'wrong-password' } });

    await expect(attempt).rejects.toMatchObject({ body: { code: 'INVALID_EMAIL_OR_PASSWORD' } });
    expect(authMessage('INVALID_EMAIL_OR_PASSWORD')).toBe('Грешен имейл или парола');
    expect(tables.session.length).toBe(sessionsBefore);
  });

  test('the right password creates a session', async () => {
    const { auth, tables } = setup();
    await auth.api.signUpEmail({ body: { email: 'student@example.com', password: 'correct-horse', name: 'student' } });
    const sessionsBefore = tables.session.length;
    await auth.api.signInEmail({ body: { email: 'student@example.com', password: 'correct-horse' } });
    expect(tables.session.length).toBe(sessionsBefore + 1);
  });

  test('a new account is a student and the password is not stored as typed', async () => {
    const { auth, tables } = setup();
    await auth.api.signUpEmail({ body: { email: 'student@example.com', password: 'correct-horse', name: 'student' } });
    expect(tables.user[0]).toMatchObject({ email: 'student@example.com', role: 'student' });
    expect(JSON.stringify(tables.account)).not.toContain('correct-horse');
  });

  test('nobody can sign up as a publisher', async () => {
    const { auth, tables } = setup();
    const body = { email: 'sneaky@example.com', password: 'correct-horse', name: 'x', role: 'publisher' };
    await auth.api.signUpEmail({ body } as never).catch(() => {});
    expect(tables.user.every((u) => (u as { role: string }).role !== 'publisher')).toBe(true);
  });

  test('an unknown error code still gives a readable sentence', () => {
    expect(authMessage(undefined)).toBe('Нещо се обърка. Опитайте отново.');
    expect(authMessage('SOMETHING_NEW')).toBe('Нещо се обърка. Опитайте отново.');
  });
});

describe('MCP_TOKEN', () => {
  test('a session token signs the MCP server in as that user, through Better Auth', async () => {
    const { auth } = setup();
    const { token } = await auth.api.signUpEmail({ body: { email: 'student@example.com', password: 'correct-horse', name: 'student' } });
    expect(await actorFromToken(token!, auth)).toMatchObject({ role: 'student' });
  });

  test('a missing or wrong token is nobody', async () => {
    const { auth } = setup();
    expect(await actorFromToken(undefined, auth)).toBeNull();
    expect(await actorFromToken('not-a-session-token', auth)).toBeNull();
  });
});

describe('Google sign-in', () => {
  const google = { GOOGLE_CLIENT_ID: 'test-client-id', GOOGLE_CLIENT_SECRET: 'test-client-secret' };
  const withEnv = (env: Record<string, string>) =>
    createAuth(memoryAdapter({ user: [], session: [], account: [], verification: [] }), env);

  test('sends the person to Google with state and PKCE, and comes back to our callback', async () => {
    const { url } = await withEnv(google).api.signInSocial({ body: { provider: 'google', callbackURL: '/week' } });
    const to = new URL(url!);
    expect(to.host).toBe('accounts.google.com');
    expect(to.searchParams.get('client_id')).toBe('test-client-id');
    expect(to.searchParams.get('state')).toBeTruthy();
    expect(to.searchParams.get('code_challenge_method')).toBe('S256');
    expect(to.searchParams.get('redirect_uri')).toMatch(/\/callback\/google$/);
  });

  test('without GOOGLE_CLIENT_ID there is no Google sign-in, and the page says so', async () => {
    await expect(withEnv({}).api.signInSocial({ body: { provider: 'google', callbackURL: '/week' } })).rejects.toMatchObject({
      body: { code: 'PROVIDER_NOT_FOUND' },
    });
    expect(authMessage('PROVIDER_NOT_FOUND')).toBe('Входът с Google не е настроен.');
  });

  test('a Google sign-in with the email of a password account is refused with the spec message', () => {
    // Better Auth refuses it (disableImplicitLinking) and redirects with ?error=account_not_linked.
    expect(withEnv(google).options.account?.accountLinking?.disableImplicitLinking).toBe(true);
    expect(authMessage('account_not_linked')).toBe('Влезте с паролата си и свържете Google от профила');
  });

  test('an email Google has not verified is refused; a verified one and a password sign-up pass', async () => {
    const validate = withEnv(google).options.user!.validateUserInfo!;
    const oauth = { method: 'oauth', oauth: { providerId: 'google', profile: {} } } as const;
    const user = (emailVerified: boolean) => ({ email: 'a@example.com', emailVerified, name: 'a' });
    expect(await validate({ user: user(false), source: oauth } as never)).toEqual({ error: 'email_not_verified' });
    expect(await validate({ user: user(true), source: oauth } as never)).toBeUndefined();
    expect(await validate({ user: user(false), source: { method: 'email' } } as never)).toBeUndefined();
    expect(authMessage('email_not_verified')).toContain('Google не е потвърдил');
  });
});
