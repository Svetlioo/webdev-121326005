import { createPlan } from '@/src/services/plans';
import { errorResponse, getActor } from '@/app/session';

/** Creates a plan: { name, group }. Answers 201 with its id. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) ?? {};
    const id = await createPlan(await getActor(), { name: String(body.name ?? ''), group: String(body.group ?? '') });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
