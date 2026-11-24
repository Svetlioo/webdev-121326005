import { deleteNote } from '@/src/services/schedule';
import { errorResponse, getActor } from '@/app/session';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await deleteNote(await getActor(), Number((await params).id));
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
