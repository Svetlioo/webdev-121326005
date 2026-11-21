/** The variables the server cannot start without. OLLAMA_URL, MCP_TOKEN and Google's are optional. */
export const REQUIRED = ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL'] as const;

/** Stops the start with a message naming every missing variable, instead of failing later on a request. */
export function checkEnv(env: Record<string, string | undefined> = process.env): void {
  const missing = REQUIRED.filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}. See .env.example.`);
}
