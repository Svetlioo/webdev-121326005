import { describe, expect, test, vi } from 'vitest';
import { GET } from '../../app/health/route';
import { pingDb } from '../../src/data/health';

vi.mock('../../src/data/health', () => ({ pingDb: vi.fn() }));

describe('GET /health', () => {
  test('200 with the database up, 503 with it down', async () => {
    vi.mocked(pingDb).mockResolvedValue();
    const ok = await GET();
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ status: 'ok', db: 'ok' });
    vi.mocked(pingDb).mockRejectedValue(new Error('down'));
    const down = await GET();
    expect(down.status).toBe(503);
    expect(await down.json()).toEqual({ status: 'error', db: 'down' });
  });
});
