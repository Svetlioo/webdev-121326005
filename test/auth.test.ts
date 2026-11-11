import { describe, expect, test } from 'vitest';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createAuth } from '../src/auth';
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
