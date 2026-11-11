import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getActor } from '@/app/session';
import { AppError } from '@/src/services/errors';
import { getImport } from '@/src/services/imports';
import { ActionButton } from '../actions';

const DAYS = ['', 'пон', 'вт', 'ср', 'чет', 'пет', 'съб'];
const TYPES: Record<string, string> = { lecture: 'лекция', seminar: 'семинар', lab: 'упражнение' };
const PARITY: Record<string, string> = { all: '', odd: ' (нечетни)', even: ' (четни)' };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) redirect('/signin');
  const id = Number((await params).id);
  const found = await getImport(actor, id).catch((error) => {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  });
  const invalid = found.draft.filter((c) => c.problems.length > 0).length;

  return (
    <main className="mx-auto grid max-w-5xl gap-4 px-4 py-8">
      <Link href="/imports" className="text-sm text-muted-foreground hover:text-foreground">
        ← Всички внасяния
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Преглед на внасяне № {found.id}</h1>
      <p className="text-sm text-muted-foreground">
        {found.draft.length} занятия{invalid > 0 && `, ${invalid} невалидни: поправете или премахнете ги, за да публикувате`}.
        Нищо не се вижда от студентите преди „Публикувай“.
      </p>
      <ul className="divide-y rounded-lg border bg-background text-sm">
        {found.draft.map((c, index) => (
          <li
            key={index}
            data-invalid={c.problems.length > 0 || undefined}
            className="flex items-start justify-between gap-3 px-4 py-3 data-invalid:bg-destructive/10"
          >
            <div className="min-w-0">
              <p>
                <span className="font-medium">{c.course || '—'}</span> {TYPES[c.type] ?? c.type} · {DAYS[c.day] ?? c.day} {c.startsAt}–{c.endsAt} · зала{' '}
                {c.room || '—'} · от {c.startWeek}. седм. · {c.groups.map((g) => g.name + (PARITY[g.parity] ?? '')).join(', ')}
              </p>
              {c.problems.map((p) => (
                <p key={p} className="text-destructive">
                  Невалидно: {p}
                </p>
              ))}
            </div>
            {found.status === 'ready' && (
              <ActionButton url={`/api/imports/${found.id}/classes/${index}`} method="DELETE" label="Премахни" variant="ghost" />
            )}
          </li>
        ))}
      </ul>
      {found.status === 'ready' && (
        <div>
          <ActionButton url={`/api/imports/${found.id}/publish`} method="POST" label="Публикувай" disabled={!found.canPublish} />
        </div>
      )}
    </main>
  );
}
