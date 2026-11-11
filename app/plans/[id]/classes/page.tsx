import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/app/app-header';
import { DeleteButton } from '@/app/buttons';
import { getActor } from '@/app/session';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Entry } from '@/src/data/entries';
import { readablePlan } from '@/src/services/access';
import { AppError } from '@/src/services/errors';
import { findFreeRooms, LAST_WEEK, listClasses, searchClasses } from '@/src/services/schedule';

const DAYS = ['', 'Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота'];
const TYPES = { lecture: 'Лекция', seminar: 'Семинар', lab: 'Упражнение' };
const PARITY = { all: '', odd: ' · нечетни', even: ' · четни' };
const select = 'h-8 rounded-lg border border-input bg-transparent px-2 text-sm';

type Params = Record<string, string | string[] | undefined>;
const param = (p: Params, key: string, fallback = '') => (typeof p[key] === 'string' ? (p[key] as string) : fallback);

/** Runs a service call and turns a refusal into a message on the page. */
async function attempt<T>(call: () => Promise<T>): Promise<{ data?: T; error?: string }> {
  try {
    return { data: await call() };
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
}

/** Every class of a plan's timetable, with search and free rooms. */
export default async function ClassesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Params> }) {
  const actor = await getActor();
  if (!actor) redirect('/signin');
  const id = Number((await params).id);
  const access = await attempt(() => readablePlan(actor, id));
  if (access.error) {
    if (access.error === 'Програмата не е намерена.') notFound();
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Alert variant="destructive">
          <AlertDescription>{access.error}</AlertDescription>
        </Alert>
      </main>
    );
  }
  const { plan, canEdit } = access.data!;
  const p = await searchParams;
  const q = param(p, 'q');
  const week = Number(param(p, 'week', '1'));
  const free = { day: Number(param(p, 'day', '1')), from: param(p, 'from', '07:30'), to: param(p, 'to', '10:15'), week };
  const classes = await listClasses(actor, id);
  const found = q ? await attempt(() => searchClasses(actor, id, q)) : null;
  const rooms = p.day ? await attempt(() => findFreeRooms(actor, id, free)) : null;

  return (
    <div className="min-h-dvh bg-muted/40">
      <AppHeader actor={actor} current="plans" />
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8">
        <div className="grid gap-1">
          <Link href={`/plans/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
            ← {plan.name}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Всички занятия</h1>
          <p className="text-sm text-muted-foreground">{classes.length} занятия в разписанието на програмата.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <section aria-labelledby="search-title" className="rounded-lg border bg-background p-4">
            <h2 id="search-title" className="mb-3 text-sm font-medium">
              Търсене по дисциплина, зала или група
            </h2>
            <form className="flex gap-2">
              <Input name="q" defaultValue={q} placeholder="напр. 1211, ПИ или 222" aria-label="Търсене" />
              <Button type="submit" variant="outline">
                Търси
              </Button>
            </form>
            {found?.data && <Results classes={found.data} />}
          </section>

          <section aria-labelledby="rooms-title" className="rounded-lg border bg-background p-4">
            <h2 id="rooms-title" className="mb-3 text-sm font-medium">
              Свободни зали
            </h2>
            <form className="flex flex-wrap items-end gap-2">
              <select name="day" defaultValue={free.day} aria-label="Ден" className={select}>
                {DAYS.slice(1).map((d, i) => (
                  <option key={d} value={i + 1}>
                    {d}
                  </option>
                ))}
              </select>
              <Input name="from" type="time" defaultValue={free.from} aria-label="От" className="w-28" />
              <Input name="to" type="time" defaultValue={free.to} aria-label="До" className="w-28" />
              <Input name="week" type="number" min={1} max={LAST_WEEK} defaultValue={week} aria-label="Седмица" className="w-20" />
              <Button type="submit" variant="outline">
                Намери
              </Button>
            </form>
            {rooms?.error && <p className="mt-3 text-sm text-destructive">{rooms.error}</p>}
            {rooms?.data && <p className="mt-3 text-sm">{rooms.data.length ? rooms.data.join(', ') : 'Няма свободни зали в това време.'}</p>}
          </section>
        </div>

        <section aria-labelledby="all-title" className="rounded-lg border bg-background">
          <h2 id="all-title" className="border-b px-4 py-3 text-sm font-medium">
            Разписание
          </h2>
          {classes.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Още няма занятия.{canEdit && ' Внесете разписанието от страницата на програмата.'}
            </p>
          ) : (
            <ul className="divide-y">
              {classes.map((c) => (
                <li key={c.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-mono text-xs tabular-nums text-muted-foreground">
                      {DAYS[c.day]} · {c.startsAt}–{c.endsAt} · зала {c.room}
                    </p>
                    <p>
                      <span className="font-medium">{c.course}</span> <span className="text-muted-foreground">{TYPES[c.type]}</span>
                      {c.startWeek > 1 && <span className="text-muted-foreground"> · от {c.startWeek}. седмица</span>}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {c.groups.map((g) => (
                        <Badge key={g.name} variant="outline" className="font-normal">
                          {g.name}
                          {PARITY[g.parity]}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {canEdit && <DeleteButton id={c.id} label={`${c.course}, ${DAYS[c.day]} ${c.startsAt}`} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function Results({ classes }: { classes: Entry[] }) {
  if (classes.length === 0) return <p className="mt-3 text-sm text-muted-foreground">Нищо не е намерено.</p>;
  return (
    <ul className="mt-3 divide-y text-sm">
      {classes.map((c) => (
        <li key={c.id} className="py-2">
          <span className="font-medium">{c.course}</span> {TYPES[c.type]} · {DAYS[c.day]} {c.startsAt}–{c.endsAt} · зала {c.room} ·{' '}
          {c.groups.map((g) => g.name).join(', ')}
        </li>
      ))}
    </ul>
  );
}
