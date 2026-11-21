// The worker's loop: take the next import or plan from the queues, have the model answer it, repeat.
// The laptop runs it with Ollama at once; the website runs it with Gemini only for jobs that have waited
// `waitSeconds`, so when the laptop is on it always answers first.
import type { ModelClient } from '../model/client';
import { fetchPage, processNextImport } from '../services/imports';
import { processNextPlan } from '../services/plans';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runWorker(model: ModelClient, options: { name: string; waitSeconds: number; running: () => boolean }): Promise<void> {
  console.log(`${options.name} worker started`);
  while (options.running()) {
    try {
      const job = await processNextImport(model, fetchPage, options.waitSeconds);
      if (job) console.log(`${options.name}: import ${job.id} done`);
      const plan = await processNextPlan(model, options.waitSeconds);
      if (plan !== null) console.log(`${options.name}: plan ${plan} done`);
      if (!job && plan === null) await pause(3000);
    } catch (error) {
      console.error(`${options.name} worker: ${error instanceof Error ? error.message : error}`);
      await pause(3000);
    }
  }
}
