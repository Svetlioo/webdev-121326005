import { getSourceImage, removeSource } from '@/src/services/plans';
import { errorResponse, getActor } from '@/app/session';

type Params = { params: Promise<{ id: string; sourceId: string }> };

/** The photo of a source, for the plan's owner and readers. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id, sourceId } = await params;
    const image = await getSourceImage(await getActor(), Number(id), Number(sourceId));
    return new Response(new Uint8Array(image.data), {
      headers: { 'content-type': image.type, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id, sourceId } = await params;
    await removeSource(await getActor(), Number(id), Number(sourceId));
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
