import { sharePlan } from '@/src/services/plans';
import { errorResponse, getActor } from '@/app/session';

/** Shares the plan, read-only: { email }. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = (await request.json().catch(() => null)) ?? {};
    await sharePlan(await getActor(), Number((await params).id), String(body.email ?? ''));
    return new Response(null, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
