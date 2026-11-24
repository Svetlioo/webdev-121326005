import { saveDraftClass } from '@/src/services/imports';
import { errorResponse, getActor } from '@/app/session';

/** Adds a class to a draft under review. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json().catch(() => null);
    await saveDraftClass(await getActor(), Number((await params).id), null, body);
    return new Response(null, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
