import { describe, expect, test, vi } from 'vitest';
import { checkHealth } from '../../src/services/health';
import { checkEnv } from '../../src/env';

describe('health', () => {
  test('ok when the database answers', async () => {
    expect(await checkHealth(async () => {})).toEqual({ status: 'ok', db: 'ok' });
  });

  test('down when the database fails', async () => {
    expect(await checkHealth(async () => Promise.reject(new Error('ECONNREFUSED')))).toEqual({ status: 'error', db: 'down' });
  });

  test('down when the database does not answer within 3 seconds', async () => {
    vi.useFakeTimers();
    const pending = checkHealth(() => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toEqual({ status: 'error', db: 'down' });
    vi.useRealTimers();
  });
});

describe('environment', () => {
  test('names every missing variable', () => {
    expect(() => checkEnv({ DATABASE_URL: 'x' })).toThrow('Missing environment variables: BETTER_AUTH_SECRET, BETTER_AUTH_URL');
  });

  test('passes when all are set', () => {
    expect(() => checkEnv({ DATABASE_URL: 'x', BETTER_AUTH_SECRET: 'y', BETTER_AUTH_URL: 'z' })).not.toThrow();
  });
});
