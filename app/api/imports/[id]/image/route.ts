import { getImportImage } from '@/src/services/imports';
import { errorResponse, getActor } from '@/app/session';

/** The photo an import was started with, for the plan's owner or an admin. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const image = await getImportImage(await getActor(), Number((await params).id));
    return new Response(new Uint8Array(image.data), {
      headers: { 'content-type': image.type, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
