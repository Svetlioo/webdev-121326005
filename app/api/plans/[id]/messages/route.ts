import { sendMessage } from '@/src/services/plans';
import { errorResponse, getActor } from '@/app/session';

/** A chat message to the model: { text }. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = (await request.json().catch(() => null)) ?? {};
    await sendMessage(await getActor(), Number((await params).id), String(body.text ?? ''));
    return new Response(null, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
