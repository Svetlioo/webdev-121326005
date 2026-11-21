// Runs once when the server starts: a missing variable stops it with a clear message, and with
// GEMINI_API_KEY set the backup worker starts. It answers only jobs that waited 30 s, so the laptop's
// local model goes first whenever it is on.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { checkEnv } = await import('./src/env');
  checkEnv();
  const { geminiFromEnv } = await import('./src/model/gemini');
  const gemini = geminiFromEnv();
  if (gemini) {
    const { runWorker } = await import('./src/worker/loop');
    void runWorker(gemini, { name: 'gemini', waitSeconds: 30, running: () => true });
  }
}
