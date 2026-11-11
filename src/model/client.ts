// What the app needs from a model, whoever provides it. Only src/model/ollama.ts names a provider.

/** What one schedule import gives the model: the page text or a photo, and the publisher's instructions. */
export type ScheduleSource = {
  text?: string;
  image?: { data: Buffer; type: string };
  instructions: string;
};

/** What one plan gives the model: the student's instructions and photos, and the chat so far. */
export type PlanSource = {
  instructions: string[];
  images: { data: Buffer; type: string }[];
  messages: { role: 'user' | 'assistant'; content: string }[];
};

export interface ModelClient {
  /** Reads a schedule and returns the model's JSON, not yet checked. */
  readSchedule(source: ScheduleSource): Promise<unknown>;
  /** Reads a student's busy windows and a reply for the chat; JSON, not yet checked. */
  readPlan(source: PlanSource): Promise<unknown>;
}

/** The model did not answer within the timeout. */
export class ModelTimeoutError extends Error {}

/** No model is configured or it could not be reached (as on Render, where OLLAMA_URL is empty). */
export class ModelUnavailableError extends Error {}

/** The model answered with something that is not JSON. */
export class ModelOutputError extends Error {}
