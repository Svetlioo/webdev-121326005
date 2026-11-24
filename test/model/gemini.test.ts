import { describe, expect, test, vi } from 'vitest';
import { ModelOutputError, ModelTimeoutError, ModelUnavailableError } from '../../src/model/client';
import { createGeminiClient, geminiFromEnv } from '../../src/model/gemini';

// A fake fetch stands in for Google: tests never call Gemini.
const answer = (text: string, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status })) as unknown as typeof fetch;
const client = (fetchImpl: typeof globalThis.fetch) => createGeminiClient({ apiKey: 'test-key', model: 'gemini-3.8-flash', timeoutMs: 1000, fetch: fetchImpl });
const plan = { instructions: ['Работя от 9:00 до 16:30'], images: [{ data: Buffer.from('png'), type: 'image/png' }], messages: [{ role: 'user' as const, content: 'и в събота' }, { role: 'assistant' as const, content: 'добре' }], myGroup: '222', subjects: [] };

describe('the Gemini client', () => {
  test('a schedule import sends the page text with the key in a header and the schema in the instruction, and parses JSON', async () => {
    const fetchMock = answer('```json\n{"classes": []}\n```');
    expect(await client(fetchMock).readSchedule({ text: 'ПИ л.у. 1211', instructions: '' })).toEqual({ classes: [] });
    const [url, init] = vi.mocked(fetchMock).mock.calls[0];
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    expect(init!.headers).toMatchObject({ 'x-goog-api-key': 'test-key' });
    const body = JSON.parse(String(init!.body));
    expect(body.systemInstruction.parts[0].text).toContain('"required":["classes"]');
    expect(body.contents[0].parts[0].text).toContain('ПИ л.у. 1211');
    expect(body.generationConfig).toMatchObject({ responseMimeType: 'application/json' });
  });

  test('a photo goes inline; a plan sends the instructions, photos and the chat with Gemini\'s roles', async () => {
    const fetchMock = answer('{"reply":"ok","windows":[]}');
    await client(fetchMock).readSchedule({ image: { data: Buffer.from('png'), type: 'image/png' }, instructions: 'само 222' });
    expect(JSON.parse(String(vi.mocked(fetchMock).mock.calls[0][1]!.body)).contents[0].parts[1]).toEqual({ inlineData: { mimeType: 'image/png', data: Buffer.from('png').toString('base64') } });
    expect(await client(fetchMock).readPlan(plan)).toEqual({ reply: 'ok', windows: [] });
    const body = JSON.parse(String(vi.mocked(fetchMock).mock.calls[1][1]!.body));
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'user', 'model', 'user']);
    expect(body.contents[0].parts[0].text).toContain('Работя от 9:00 до 16:30');
    expect(body.contents[0].parts[1].inlineData.mimeType).toBe('image/png');
  });

  test('a rate limit or an error is "unavailable", no answer in time is a timeout, and prose is an output error', async () => {
    await expect(client(answer('', 429)).readPlan(plan)).rejects.toBeInstanceOf(ModelUnavailableError);
    await expect(client(answer('', 500)).readPlan(plan)).rejects.toBeInstanceOf(ModelUnavailableError);
    const refused = vi.fn(async () => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch;
    await expect(client(refused).readPlan(plan)).rejects.toBeInstanceOf(ModelUnavailableError);
    const never = ((_u: string, init: RequestInit) => new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))) as typeof fetch;
    await expect(createGeminiClient({ apiKey: 'k', model: 'm', timeoutMs: 20, fetch: never }).readPlan(plan)).rejects.toBeInstanceOf(ModelTimeoutError);
    await expect(client(answer('Ето разписанието!')).readPlan(plan)).rejects.toBeInstanceOf(ModelOutputError);
    const empty = vi.fn(async () => new Response(JSON.stringify({}))) as unknown as typeof fetch;
    await expect(client(empty).readPlan(plan)).rejects.toBeInstanceOf(ModelOutputError);
  });

  test('without GEMINI_API_KEY there is no backup; with it, Gemini 3.8 Flash by default', () => {
    expect(geminiFromEnv({})).toBeNull();
    expect(geminiFromEnv({ GEMINI_API_KEY: 'k' })).toHaveProperty('readPlan');
  });
});
