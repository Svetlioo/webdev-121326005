import { removeDraftClass } from '@/src/services/imports';
import { errorResponse, getActor } from '@/app/session';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  try {
    const { id, index } = await params;
    await removeDraftClass(await getActor(), Number(id), Number(index));
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
