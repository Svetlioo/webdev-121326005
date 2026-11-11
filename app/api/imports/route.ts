import { requirePublisher } from '@/src/services/errors';
import { ONLY_PUBLISHERS, startImport } from '@/src/services/imports';
import { errorResponse, getActor } from '@/app/session';

/** Starts an import from a page address or a photo (multipart form: url, photo, instructions). */
export async function POST(request: Request) {
  try {
    const actor = await getActor();
    requirePublisher(actor, ONLY_PUBLISHERS); // before the upload is read; the service checks again
    const form = await request.formData().catch(() => new FormData());
    const photo = form.get('photo');
    const file = photo instanceof File && photo.size > 0 ? photo : null;
    const created = await startImport(actor, {
      sourceUrl: String(form.get('url') ?? ''),
      image: file ? Buffer.from(await file.arrayBuffer()) : undefined,
      imageType: file?.type,
      instructions: String(form.get('instructions') ?? ''),
    });
    return Response.json({ id: created.id, status: created.status }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
