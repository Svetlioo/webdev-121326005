import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getActor } from '@/app/session';
import { SignOutButton } from '@/app/schedule/buttons';
import type { Entry } from '@/src/data/entries';
import { AppError } from '@/src/services/errors';
import { findFreeRooms, getWeek, LAST_WEEK, listClasses, searchClasses } from '@/src/services/schedule';
import { authMessage } from '@/src/auth-messages';
import { LinkGoogleButton } from './link-google';
import { NoteForm } from './note-form';

const DAYS = ['', 'Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота'];
const TYPES = { lecture: 'Лекция', seminar: 'Семинар', lab: 'Упражнение' };
const select =
  'h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

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

export default async function WeekPage({ searchParams }: { searchParams: Promise<Params> }) {
  const actor = await getActor();
  if (!actor) redirect('/signin');
  const p = await searchParams;
  const publisher = actor.role === 'publisher';

  const groups = [...new Set((await listClasses(actor)).flatMap((c) => c.groups.map((g) => g.name)))].sort();
  const group = param(p, 'group', groups[0] ?? '');
  const week = Number(param(p, 'week', '1'));
  const q = param(p, 'q');
  const free = { day: Number(param(p, 'day', '1')), from: param(p, 'from', '07:30'), to: param(p, 'to', '10:15') };

  const classes = await attempt(() => getWeek(actor, group, week));
  const found = q ? await attempt(() => searchClasses(actor, q)) : null;
  const rooms = p.day ? await attempt(() => findFreeRooms(actor, { ...free, week })) : null;

  return (
    <div className="min-h-dvh bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <nav className="flex gap-4 text-sm">
            <span className="font-medium">Седмица</span>
            <Link href="/schedule" className="text-muted-foreground hover:text-foreground">
              Цялото разписание
            </Link>
          </nav>
          <div className="flex items-center gap-1">
            <LinkGoogleButton />
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Моята седмица</h1>
        {p.error && (
          <Alert variant="destructive">
            <AlertDescription>{authMessage(param(p, 'error'))}</AlertDescription>
          </Alert>
        )}

        <form className="flex flex-wrap items-end gap-3 rounded-lg border bg-background p-4">
          <label className="grid gap-1 text-sm">
            Група
            <select name="group" defaultValue={group} className={select}>
              {groups.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Седмица
            <Input name="week" type="number" min={1} max={LAST_WEEK} defaultValue={week} className="w-20" />
          </label>
          <Button type="submit">Покажи</Button>
        </form>

        <section aria-labelledby="week-title" className="rounded-lg border bg-background">
          <h2 id="week-title" className="border-b px-4 py-3 text-sm font-medium">
            Група {group}, {week}. седмица ({week % 2 ? 'нечетна' : 'четна'})
          </h2>
          {classes.error ? (
            <Alert variant="destructive" className="m-4 w-auto">
              <AlertDescription>{classes.error}</AlertDescription>
            </Alert>
          ) : classes.data!.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Няма занятия тази седмица.</p>
          ) : (
            <ul className="divide-y">
              {classes.data!.map((c) => (
                <li key={c.id} className="px-4 py-3">
                  <p className="font-mono text-xs tabular-nums text-muted-foreground">
                    {DAYS[c.day]} · {c.startsAt}–{c.endsAt} · зала {c.room}
                  </p>
                  <p className={c.cancelled ? 'text-muted-foreground line-through' : ''}>
                    <span className="font-medium">{c.course}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{TYPES[c.type]}</span>
                  </p>
                  {c.notes.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.notes.map((n) => (
                        <Badge key={n.id} variant={c.cancelled ? 'destructive' : 'secondary'}>
                          {n.text}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {publisher && <NoteForm entryId={c.id} week={week} label={`${c.course}, ${DAYS[c.day]} ${c.startsAt}`} />}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="search-title" className="rounded-lg border bg-background p-4">
          <h2 id="search-title" className="mb-3 text-sm font-medium">
            Търсене по дисциплина, зала или група
          </h2>
          <form className="flex gap-2">
            <input type="hidden" name="group" value={group} />
            <input type="hidden" name="week" value={week} />
            <Input name="q" defaultValue={q} placeholder="напр. 1211, ПИ или 222" aria-label="Търсене" className="max-w-xs" />
            <Button type="submit" variant="outline">
              Търси
            </Button>
          </form>
          {found?.error && <p className="mt-3 text-sm text-destructive">{found.error}</p>}
          {found?.data && <Results classes={found.data} />}
        </section>

        <section aria-labelledby="rooms-title" className="rounded-lg border bg-background p-4">
          <h2 id="rooms-title" className="mb-3 text-sm font-medium">
            Свободни зали през {week}. седмица
          </h2>
          <form className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="group" value={group} />
            <input type="hidden" name="week" value={week} />
            <select name="day" defaultValue={free.day} aria-label="Ден" className={select}>
              {DAYS.slice(1).map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </select>
            <Input name="from" type="time" defaultValue={free.from} aria-label="От" className="w-28" />
            <Input name="to" type="time" defaultValue={free.to} aria-label="До" className="w-28" />
            <Button type="submit" variant="outline">
              Намери
            </Button>
          </form>
          {rooms?.error && <p className="mt-3 text-sm text-destructive">{rooms.error}</p>}
          {rooms?.data && (
            <p className="mt-3 text-sm">
              {rooms.data.length ? rooms.data.join(', ') : 'Няма свободни зали в това време.'}
            </p>
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
          <span className="font-medium">{c.course}</span> {TYPES[c.type]} · {DAYS[c.day]} {c.startsAt}–{c.endsAt} · зала{' '}
          {c.room} · {c.groups.map((g) => g.name).join(', ')}
        </li>
      ))}
    </ul>
  );
}
