// Runs once when the server starts: a missing variable stops it with a clear message.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { checkEnv } = await import('./src/env');
    checkEnv();
  }
}
