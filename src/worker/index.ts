// The import worker: `npm run worker`, on the laptop next to the model. It reads the queue in
// the imports table, so an HTTP request never waits for the model.
import { closeDb } from '../data/db';
import { modelFromEnv } from '../model/ollama';
import { processNextImport } from '../services/imports';

const model = modelFromEnv();
let running = true;
process.on('SIGINT', () => (running = false));
process.on('SIGTERM', () => (running = false));

async function main() {
  console.log(`worker started, model ${process.env.OLLAMA_URL ? process.env.MODEL_NAME : 'none (imports will fail)'}`);
  while (running) {
    try {
      const job = await processNextImport(model);
      if (job) console.log(`import ${job.id} done`);
      else await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (error) {
      console.error(`worker: ${error instanceof Error ? error.message : error}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  await closeDb();
}

main();
