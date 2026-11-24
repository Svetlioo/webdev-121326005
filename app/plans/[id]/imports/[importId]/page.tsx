import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/app/app-header';
import { ActionButton } from '@/app/client-actions';
import { getActor } from '@/app/session';
import { AppError } from '@/src/services/errors';
import { getImport } from '@/src/services/imports';
import { ClassForm, type FormClass } from './class-form';

const DAYS = ['', 'пон', 'вт', 'ср', 'чет', 'пет', 'съб'];
const TYPES: Record<string, string> = { lecture: 'лекция', seminar: 'семинар', lab: 'упражнение' };
const PARITY: Record<string, string> = { all: '', odd: ' (нечетни)', even: ' (четни)' };

export default async function ReviewPage({ params }: { params: Promise<{ id: string; importId: string }> }) {
  const actor = await getActor();
  if (!actor) redirect('/signin');
  const { id: planId, importId } = await params;
  const found = await getImport(actor, Number(importId)).catch((error) => {
    if (error instanceof AppError && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  });
  const invalid = found.draft.filter((c) => c.problems.length > 0).length;

  return (
    <div className="min-h-dvh bg-muted/40">
    <AppHeader actor={actor} current="plans" />
    <main className="mx-auto grid max-w-6xl gap-4 px-4 py-8">
      <Link href={`/plans/${planId}`} className="text-sm text-muted-foreground hover:text-foreground">
        ← Към програмата
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Преглед на внасяне № {found.id}</h1>
      <p className="text-sm text-muted-foreground">
        {found.draft.length} занятия{invalid > 0 && `, ${invalid} невалидни: поправете или премахнете ги, за да публикувате`}.
        Може да промените, добавите или махнете занятие. Програмата не се променя преди „Публикувай“; тогава това разписание замества сегашното ѝ.
      </p>
      <div className="grid gap-2 rounded-lg border bg-background p-4 text-sm">
        <p className="font-medium">Прочетено от</p>
        {found.sourceUrl && (
          <p className="truncate">
            Линк:{' '}
            <a href={found.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              {found.sourceUrl}
            </a>
          </p>
        )}
        {found.hasImage && (
          <a href={`/api/imports/${found.id}/image`} target="_blank" rel="noreferrer" className="w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/imports/${found.id}/image`} alt="Снимката на разписанието" className="max-h-48 rounded-md border object-contain" />
          </a>
        )}
        {found.instructions && <p>Указания: {found.instructions}</p>}
      </div>
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
              <div className="flex shrink-0 gap-1">
                <ClassForm importId={found.id} index={index} initial={{ course: c.course, type: c.type, day: c.day, startsAt: c.startsAt, endsAt: c.endsAt, room: c.room, startWeek: c.startWeek, groups: c.groups } as FormClass} />
                <ActionButton url={`/api/imports/${found.id}/classes/${index}`} method="DELETE" label="Премахни" variant="ghost" />
              </div>
            )}
          </li>
        ))}
      </ul>
      {found.status === 'ready' && (
        <div className="flex flex-wrap items-center gap-2">
          <ClassForm importId={found.id} />
          <ActionButton url={`/api/imports/${found.id}/publish`} method="POST" label="Публикувай" disabled={!found.canPublish} />
        </div>
      )}
    </main>
    </div>
  );
}
