import { setUserRole } from '@/src/services/users';
import { errorResponse, getActor } from '@/app/session';

/** Changes a user's role: { role }. Admins only. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = (await request.json().catch(() => null)) ?? {};
    await setUserRole(await getActor(), (await params).id, String(body.role ?? ''));
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
