import { addNote } from '@/src/services/schedule';
import { errorResponse, getActor } from '@/app/session';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) ?? {};
    const note = await addNote(await getActor(), {
      entryId: Number(body.entryId),
      week: body.week == null ? null : Number(body.week),
      text: String(body.text ?? ''),
    });
    return Response.json(note, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
