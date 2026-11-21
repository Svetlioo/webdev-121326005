// The only file that knows the provider: a local Ollama with qwen3.8:27b-mlx. Nothing leaves the laptop.
import type { z } from 'zod';
import {
  ModelOutputError,
  ModelTimeoutError,
  ModelUnavailableError,
  type ModelClient,
  type PlanSource,
  type ScheduleSource,
} from './client';
import { importAnswer, jsonSchema, planAnswer } from './schemas';

const SCHEDULE_PROMPT = `You read a weekly university timetable from Technical University of Sofia.
Answer with one object per class and per group pattern: course, type (lecture, seminar or lab), day (1 = Monday ... 6 = Saturday),
startsAt and endsAt as HH:MM, room, startWeek and groups (each with name and parity all, odd or even).
Rules: "л." or "Лекция" is a lecture, "л.у." or "Лабораторно упражнение" is a lab, "с.у." is a seminar; the room follows the type.
Lectures are held every week (parity all) from week 1, unless the page says otherwise for that lecture.
Only a class marked "Нечетна седмица" / "Четна седмица", or a cell split diagonally, alternates: give each group its parity.
The notes under the timetable give the week each course's labs start (for example "ПИ – от 2. седмица"): use them as startWeek of those labs; lectures start in week 1.
The room is only its number or name, without the word "Зала". Groups are TU Sofia group numbers such as 221а or 222. Never include names of students or teachers.`;

const PLAN_PROMPT = `You help a university student in Sofia plan their week around their classes.
1. windows: from the student's instructions, photos and messages, list every time they are busy (work, meetings, travel):
   day (1 = Monday ... 6 = Saturday; "делничните дни" means 1 to 5), from and to as HH:MM, and what in a few words.
2. instructions: only if the student asks in the chat to change what they told you (for example "I don't work on Fridays
   any more"), return the complete new list of their instructions, short sentences in Bulgarian. Otherwise leave it out.
3. subjects: only if the student asks to take a subject with another group, or to drop one, return those subjects with the
   group to attend (one of the groups that have it) or null to drop it. Otherwise leave it out.
4. reply: a short, friendly answer in Bulgarian saying what you understood and what you changed.
Do not decide which classes they can attend; the app does that.`;

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
      const user = [source.text ? `Timetable:\n${source.text}` : 'The timetable is in the photo.'];
      if (source.instructions) user.push(`The student's instructions: ${source.instructions}`);
      return ask(
        [
          { role: 'system', content: SCHEDULE_PROMPT },
          { role: 'user', content: user.join('\n\n'), images: source.image ? [source.image.data.toString('base64')] : undefined },
        ],
        importAnswer,
      );
    },

    readPlan(source: PlanSource) {
      const instructions = source.instructions.map((t) => `- ${t}`).join('\n') || '(none)';
      return ask(
        [
          { role: 'system', content: PLAN_PROMPT },
          {
            role: 'user',
            content: [
              `My group: ${source.myGroup ?? 'not chosen yet'}`,
              `Subjects (course, type: groups that have it; my choice):\n${source.subjects.map((s) => `- ${s.course}, ${s.type}: ${s.groups.join(', ')}; ${s.chosen ?? 'not taken'}`).join('\n') || '(no timetable yet)'}`,
              `My instructions:\n${instructions}${source.images.length ? '\nMy photos are attached.' : ''}`,
            ].join('\n\n'),
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
    model: env.MODEL_NAME || 'qwen3-vl:4b-instruct',
    timeoutMs: Number(env.MODEL_TIMEOUT_MS) || 120_000,
    think: env.MODEL_THINK === 'true',
  });
}
