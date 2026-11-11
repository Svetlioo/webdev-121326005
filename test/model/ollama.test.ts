import { describe, expect, test, vi } from 'vitest';
import { ModelOutputError, ModelTimeoutError, ModelUnavailableError } from '../../src/model/client';
import { createOllamaClient, modelFromEnv } from '../../src/model/ollama';

// A fake fetch stands in for Ollama: tests never call the model.
const source = { text: 'ПИ л.у. 1211', instructions: 'само 222', groups: ['221а', '222'] };
const answer = (content: string, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify({ message: { content } }), { status })) as unknown as typeof fetch;

describe('the Ollama client', () => {
  test('sends the text, the instructions and the groups, and returns the parsed JSON', async () => {
    const fetchMock = answer('{"classes": []}');
    const client = createOllamaClient({ url: 'http://localhost:11434', model: 'qwen', timeoutMs: 1000, fetch: fetchMock });
    expect(await client.readSchedule(source)).toEqual({ classes: [] });
    const [url, init] = vi.mocked(fetchMock).mock.calls[0];
    const body = JSON.parse(String(init!.body));
    expect(url).toBe('http://localhost:11434/api/chat');
    expect(body).toMatchObject({ model: 'qwen', format: 'json', stream: false });
    expect(body.messages[0].content).toContain('221а, 222');
    expect(body.messages[1].content).toContain('ПИ л.у. 1211');
    expect(body.messages[1].content).toContain('само 222');
  });

  test('a photo goes as base64', async () => {
    const fetchMock = answer('[]');
    const client = createOllamaClient({ url: 'http://m', model: 'qwen', timeoutMs: 1000, fetch: fetchMock });
    await client.readSchedule({ image: { data: Buffer.from('png'), type: 'image/png' }, instructions: '', groups: [] });
    const body = JSON.parse(String(vi.mocked(fetchMock).mock.calls[0][1]!.body));
    expect(body.messages[1].images).toEqual([Buffer.from('png').toString('base64')]);
    expect(body.messages[1].content).toContain('photo');
  });

  test('AC-4 a model that never answers is stopped by the timeout', async () => {
    const never = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))) as typeof fetch;
    const client = createOllamaClient({ url: 'http://m', model: 'qwen', timeoutMs: 20, fetch: never });
    await expect(client.readSchedule(source)).rejects.toBeInstanceOf(ModelTimeoutError);
  });

  test('a model that is down or answers with an error is unavailable', async () => {
    const refused = vi.fn(async () => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch;
    await expect(createOllamaClient({ url: 'http://m', model: 'q', timeoutMs: 1000, fetch: refused }).readSchedule(source)).rejects.toBeInstanceOf(
      ModelUnavailableError,
    );
    const broken = answer('', 500);
    await expect(createOllamaClient({ url: 'http://m', model: 'q', timeoutMs: 1000, fetch: broken }).readSchedule(source)).rejects.toBeInstanceOf(
      ModelUnavailableError,
    );
  });

  test('an answer that is not JSON is an output error', async () => {
    const client = createOllamaClient({ url: 'http://m', model: 'q', timeoutMs: 1000, fetch: answer('Here is your timetable!') });
    await expect(client.readSchedule(source)).rejects.toBeInstanceOf(ModelOutputError);
  });
});

describe('modelFromEnv', () => {
  test('without OLLAMA_URL (as on Render) the fallback fails at once instead of waiting', async () => {
    await expect(modelFromEnv({}).readSchedule(source)).rejects.toBeInstanceOf(ModelUnavailableError);
  });

  test('with OLLAMA_URL it talks to Ollama', () => {
    expect(modelFromEnv({ OLLAMA_URL: 'http://localhost:11434' })).toHaveProperty('readSchedule');
  });
});
