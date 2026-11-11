import { requireActor } from '@/src/services/errors';
import { addSource } from '@/src/services/plans';
import { errorResponse, getActor } from '@/app/session';

/** Adds a source: a multipart form with `text`, or with a `photo`. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = requireActor(await getActor()); // before the upload is read; the service checks the owner
    const form = await request.formData().catch(() => new FormData());
    const photo = form.get('photo');
    const file = photo instanceof File && photo.size > 0 ? photo : null;
    await addSource(actor, Number((await params).id), {
      text: String(form.get('text') ?? ''),
      image: file ? Buffer.from(await file.arrayBuffer()) : undefined,
      imageType: file?.type,
    });
    return new Response(null, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
