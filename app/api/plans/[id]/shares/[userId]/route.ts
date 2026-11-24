import { unsharePlan } from '@/src/services/plans';
import { errorResponse, getActor } from '@/app/session';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const { id, userId } = await params;
    await unsharePlan(await getActor(), Number(id), userId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
