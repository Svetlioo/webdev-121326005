import { retryImport } from '@/src/services/imports';
import { errorResponse, getActor } from '@/app/session';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await retryImport(await getActor(), Number((await params).id));
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
