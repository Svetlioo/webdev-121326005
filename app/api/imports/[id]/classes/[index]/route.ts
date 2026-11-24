import { removeDraftClass, saveDraftClass } from '@/src/services/imports';
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

/** Replaces one class of a draft under review. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  try {
    const { id, index } = await params;
    const body = await request.json().catch(() => null);
    await saveDraftClass(await getActor(), Number(id), Number(index), body);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
