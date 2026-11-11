// The only file that knows the provider: a local Ollama with qwen3.8:27b-mlx. Nothing leaves the laptop.
import { ModelOutputError, ModelTimeoutError, ModelUnavailableError, type ModelClient, type ScheduleSource } from './client';

const PROMPT = `You read a weekly university timetable from Technical University of Sofia and return JSON only.
Return {"classes": [...]}, one object per class and per group pattern:
{"course": "ПИ", "type": "lecture" | "seminar" | "lab", "day": 1-6 (1 = Monday), "startsAt": "HH:MM", "endsAt": "HH:MM",
 "room": "1211", "startWeek": 1, "groups": [{"name": "221а", "parity": "all" | "odd" | "even"}]}
Rules: "л." is a lecture, "л.у." is a lab, "с.у." is a seminar; the room follows the type. A cell split diagonally is
a class held in alternating weeks: give each group its parity. Footnotes such as "упражненията започват от 3 седмица"
set startWeek. Use only these groups: {groups}. Never include names of students or teachers.`;

export type OllamaOptions = { url: string; model: string; timeoutMs: number; fetch?: typeof fetch };

export function createOllamaClient({ url, model, timeoutMs, fetch: fetchImpl = fetch }: OllamaOptions): ModelClient {
  return {
    async readSchedule(source: ScheduleSource) {
      const user = [source.text ? `Timetable:\n${source.text}` : 'The timetable is in the photo.'];
      if (source.instructions) user.push(`Publisher's instructions: ${source.instructions}`);
      let body: { message?: { content?: string } };
      try {
        const response = await fetchImpl(`${url}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({
            model,
            stream: false,
            format: 'json',
            messages: [
              { role: 'system', content: PROMPT.replace('{groups}', source.groups.join(', ')) },
              { role: 'user', content: user.join('\n\n'), images: source.image ? [source.image.data.toString('base64')] : undefined },
            ],
          }),
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
    },
  };
}

/** No model (OLLAMA_URL empty, as on Render): the fallback is to fail the import at once, never to hang. */
const noModel: ModelClient = {
  async readSchedule() {
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
  });
}
