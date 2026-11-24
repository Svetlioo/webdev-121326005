import { chooseSubject, deletePlan, setMyGroup } from '@/src/services/plans';
import { errorResponse, getActor } from '@/app/session';

/**
 * Changes the plan's choices: { myGroup: "222" } sets the student's group, and
 * { subject: { course, type, group } } chooses a subject's group (group null: not taken).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = (await request.json().catch(() => null)) ?? {};
    const actor = await getActor();
    const id = Number((await params).id);
    if (body.subject) {
      const s = body.subject;
      await chooseSubject(actor, id, { course: String(s.course ?? ''), type: s.type, group: s.group == null ? null : String(s.group) });
    } else {
      await setMyGroup(actor, id, String(body.myGroup ?? ''));
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await deletePlan(await getActor(), Number((await params).id));
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
