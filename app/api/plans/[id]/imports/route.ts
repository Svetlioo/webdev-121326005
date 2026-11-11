import { requireActor } from '@/src/services/errors';
import { startImport } from '@/src/services/imports';
import { errorResponse, getActor } from '@/app/session';

/** Starts an import of a timetable into the plan, from a page address or a photo (multipart: url, photo, instructions). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = requireActor(await getActor()); // before the upload is read; the service checks the owner
    const form = await request.formData().catch(() => new FormData());
    const photo = form.get('photo');
    const file = photo instanceof File && photo.size > 0 ? photo : null;
    const created = await startImport(actor, Number((await params).id), {
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
