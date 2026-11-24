// The hosted provider: Google's Gemini API, the backup when the laptop's model is off.
// What it receives leaves the app: the timetable text or photo, and for a plan the student's
// instructions, photos and chat. On Google's free tier that data may be used to improve Google's products.
import type { z } from 'zod';
import {
  ModelOutputError,
  ModelTimeoutError,
  ModelUnavailableError,
  type ModelClient,
  type PlanSource,
  type ScheduleSource,
} from './client';
import { PLAN_PROMPT, planUserText, SCHEDULE_PROMPT, scheduleUserText } from './prompts';
import { importAnswer, jsonSchema, planAnswer } from './schemas';

export type GeminiOptions = { apiKey: string; model: string; timeoutMs: number; fetch?: typeof fetch };

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };
type Content = { role: 'user' | 'model'; parts: Part[] };

const image = (i: { data: Buffer; type: string }): Part => ({ inlineData: { mimeType: i.type, data: i.data.toString('base64') } });

export function createGeminiClient({ apiKey, model, timeoutMs, fetch: fetchImpl = fetch }: GeminiOptions): ModelClient {
  /** One call that must answer JSON in the schema's shape; the server checks it with the same schema afterwards. */
  async function ask(system: string, contents: Content[], schema: z.ZodType): Promise<unknown> {
    const instruction = `${system}\nAnswer only with JSON that matches this JSON Schema:\n${JSON.stringify(jsonSchema(schema))}`;
    let body: { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    try {
      const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instruction }] },
          contents,
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        }),
      });
      if (response.status === 429) throw new ModelUnavailableError('Gemini is rate limited');
      if (!response.ok) throw new ModelUnavailableError(`Gemini answered ${response.status}`);
      body = await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') throw new ModelTimeoutError('timeout');
      if (error instanceof ModelUnavailableError) throw error;
      throw new ModelUnavailableError(error instanceof Error ? error.message : String(error));
    }
    const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    try {
      return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    } catch {
      throw new ModelOutputError('not JSON');
    }
  }

  return {
    readSchedule(source: ScheduleSource) {
      const parts: Part[] = [{ text: scheduleUserText(source) }];
      if (source.image) parts.push(image(source.image));
      return ask(SCHEDULE_PROMPT, [{ role: 'user', parts }], importAnswer);
    },

    readPlan(source: PlanSource) {
      const first: Content = { role: 'user', parts: [{ text: planUserText(source) }, ...source.images.map(image)] };
      const chat: Content[] = source.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
      // The conversation must end with the student's turn.
      const last: Content[] = chat.at(-1)?.role === 'model' ? [{ role: 'user', parts: [{ text: 'Answer now with the JSON.' }] }] : [];
      return ask(PLAN_PROMPT, [first, ...chat, ...last], planAnswer);
    },
  };
}

/** The backup model from the environment, or null when no GEMINI_API_KEY is set. */
export function geminiFromEnv(env: Record<string, string | undefined> = process.env): ModelClient | null {
  if (!env.GEMINI_API_KEY) return null;
  return createGeminiClient({
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL || 'gemini-3.8-flash',
    timeoutMs: Number(env.MODEL_TIMEOUT_MS) || 120_000,
  });
}
