// The local provider: Ollama on the laptop (qwen3.8:27b-mlx). Nothing sent here leaves the laptop.
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

// Ollama would otherwise reserve the model's whole context (262k tokens for qwen3-vl, 43 GB).
// 32k tokens is enough for one photo or one page of 30,000 characters, plus the model's thinking.
const CONTEXT_TOKENS = 32_768;

/** think: whether the model reasons before answering. Off by default: slower and not needed to copy a
 *  timetable or read busy times; MODEL_THINK=true turns it on. */
export type OllamaOptions = { url: string; model: string; timeoutMs: number; think?: boolean; fetch?: typeof fetch };

type Message = { role: 'system' | 'user' | 'assistant'; content: string; images?: string[] };

export function createOllamaClient({ url, model, timeoutMs, think = false, fetch: fetchImpl = fetch }: OllamaOptions): ModelClient {
  /** One chat call whose answer must have the schema's shape (structured output). Returns the parsed JSON. */
  async function ask(messages: Message[], schema: z.ZodType): Promise<unknown> {
    let body: { message?: { content?: string } };
    try {
      const response = await fetchImpl(`${url}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({ model, stream: false, think, format: jsonSchema(schema), options: { num_ctx: CONTEXT_TOKENS }, messages }),
      });
      if (!response.ok) throw new ModelUnavailableError(`Ollama answered ${response.status}`);
      body = await response.json(); // the timeout covers reading the answer too
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') throw new ModelTimeoutError('timeout');
      if (error instanceof ModelUnavailableError) throw error;
      throw new ModelUnavailableError(error instanceof Error ? error.message : String(error));
    }
    try {
      return JSON.parse(body.message!.content!);
    } catch {
      throw new ModelOutputError('not JSON');
    }
  }

  return {
    readSchedule(source: ScheduleSource) {
      return ask(
        [
          { role: 'system', content: SCHEDULE_PROMPT },
          { role: 'user', content: scheduleUserText(source), images: source.image ? [source.image.data.toString('base64')] : undefined },
        ],
        importAnswer,
      );
    },

    readPlan(source: PlanSource) {
      return ask(
        [
          { role: 'system', content: PLAN_PROMPT },
          {
            role: 'user',
            content: planUserText(source),
            images: source.images.length ? source.images.map((i) => i.data.toString('base64')) : undefined,
          },
          ...source.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        planAnswer,
      );
    },
  };
}

/** No model (OLLAMA_URL empty, as on Render): the fallback is to fail at once, never to hang. */
const noModel: ModelClient = {
  async readSchedule() {
    throw new ModelUnavailableError('OLLAMA_URL is empty');
  },
  async readPlan() {
    throw new ModelUnavailableError('OLLAMA_URL is empty');
  },
};

/** The model client from the environment, or the fallback when no model is configured. */
export function modelFromEnv(env: Record<string, string | undefined> = process.env): ModelClient {
  if (!env.OLLAMA_URL) return noModel;
  return createOllamaClient({
    url: env.OLLAMA_URL,
    model: env.MODEL_NAME || 'qwen3.8:27b-mlx',
    timeoutMs: Number(env.MODEL_TIMEOUT_MS) || 120_000,
    think: env.MODEL_THINK === 'true',
  });
}
