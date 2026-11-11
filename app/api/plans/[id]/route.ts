import { deletePlan, setPlanGroups } from '@/src/services/plans';
import { errorResponse, getActor } from '@/app/session';

/** Chooses the groups the plan follows: { groups: ["222", "221а"] }. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = (await request.json().catch(() => null)) ?? {};
    const groups = Array.isArray(body.groups) ? body.groups.map(String) : [];
    await setPlanGroups(await getActor(), Number((await params).id), groups);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await deletePlan(await getActor(), Number((await params).id));
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
