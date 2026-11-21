import { checkHealth } from '@/src/services/health';

// Render calls this to know the service is up: 200 when the database answers, 503 when it does not.
export const dynamic = 'force-dynamic';

export async function GET() {
  const health = await checkHealth();
  return Response.json(health, { status: health.status === 'ok' ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}
