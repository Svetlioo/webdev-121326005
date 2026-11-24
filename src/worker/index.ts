// The laptop's worker: `npm run worker`, next to the local model. It reads two queues, the imports
// table and plans with model_status 'queued', so an HTTP request never waits for the model.
import { closeDb } from '../data/db';
import { modelFromEnv } from '../model/ollama';
import { runWorker } from './loop';

let running = true;
process.on('SIGINT', () => (running = false));
process.on('SIGTERM', () => (running = false));

console.log(`model ${process.env.OLLAMA_URL ? process.env.MODEL_NAME || 'qwen3.8:27b-mlx' : 'none (imports will fail)'}`);
runWorker(modelFromEnv(), { name: 'laptop', waitSeconds: 0, running: () => running }).then(closeDb);
