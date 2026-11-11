import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getActor } from '@/app/session';
import type { Entry } from '@/src/data/entries';
import { listClasses } from '@/src/services/schedule';
import { DeleteButton, SignOutButton } from './buttons';

const DAYS = ['', 'Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота'];
const TYPES = { lecture: 'Лекция', seminar: 'Семинар', lab: 'Упражнение' };
const PARITY = { all: null, odd: 'нечетна', even: 'четна' };

export default async function SchedulePage() {
  const actor = await getActor();
  if (!actor) redirect('/signin');
  const classes = await listClasses(actor);
  const publisher = actor.role === 'publisher';
  const days = [1, 2, 3, 4, 5, 6]
    .map((day) => ({ day, classes: classes.filter((c) => c.day === day) }))
    .filter((d) => d.classes.length > 0);

  return (
    <div className="min-h-dvh bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <nav className="flex gap-4 text-sm">
            <Link href="/week" className="text-muted-foreground hover:text-foreground">
              Седмица
            </Link>
            <span className="font-medium">Цялото разписание</span>
          </nav>
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">ФКСТ, КСИ, магистри</h1>
          <p className="text-sm text-muted-foreground">
            Зимен семестър 2026/2027 · групи 221а, 221б и 222 · {classes.length} занятия
          </p>
        </div>

        {days.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-background p-10 text-center">
            <p className="font-medium">Няма занятия в разписанието</p>
            <p className="text-sm text-muted-foreground">Занятията ще се появят тук, когато бъдат публикувани.</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {days.map(({ day, classes }) => (
              <section key={day} aria-labelledby={`day-${day}`} className="min-w-0 rounded-lg border bg-background">
                <h2 id={`day-${day}`} className="border-b px-4 py-3 text-sm font-medium">
                  {DAYS[day]}
                </h2>
                <div className="hidden sm:block">
                  <DayTable classes={classes} publisher={publisher} />
                </div>
                <DayList classes={classes} publisher={publisher} />
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Groups({ entry }: { entry: Entry }) {
  return (
    <div className="flex flex-wrap gap-1">
      {entry.groups.map((g) => (
        <Badge key={g.name} variant="outline" className="font-normal">
          {g.name}
          {PARITY[g.parity] && <span className="text-muted-foreground">· {PARITY[g.parity]}</span>}
        </Badge>
      ))}
    </div>
  );
}

/** The same classes as a list, for phones. */
function DayList({ classes, publisher }: { classes: Entry[]; publisher: boolean }) {
  return (
    <ul className="divide-y sm:hidden">
      {classes.map((c) => (
        <li key={c.id} className="flex items-start gap-3 px-4 py-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              {c.startsAt}–{c.endsAt} · зала {c.room}
            </p>
            <p>
              <span className="font-medium">{c.course}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {TYPES[c.type]}
                {c.startWeek > 1 && ` · от ${c.startWeek}. седмица`}
              </span>
            </p>
            <Groups entry={c} />
          </div>
          {publisher && <DeleteButton id={c.id} label={`${c.course}, ${DAYS[c.day]} ${c.startsAt}`} />}
        </li>
      ))}
    </ul>
  );
}

function DayTable({ classes, publisher }: { classes: Entry[]; publisher: boolean }) {
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-32 pl-4">Час</TableHead>
          <TableHead className="w-[30%]">Дисциплина</TableHead>
          <TableHead className="w-20">Зала</TableHead>
          <TableHead>Групи</TableHead>
          <TableHead className="w-28">От седмица</TableHead>
          {publisher && <TableHead className="w-16 pr-4" aria-label="Действия" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {classes.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="pl-4 font-mono text-xs tabular-nums text-muted-foreground">
              {c.startsAt}–{c.endsAt}
            </TableCell>
            <TableCell>
              <span className="font-medium">{c.course}</span>
              <span className="ml-2 text-xs text-muted-foreground">{TYPES[c.type]}</span>
            </TableCell>
            <TableCell className="font-mono text-xs tabular-nums">{c.room}</TableCell>
            <TableCell>
              <Groups entry={c} />
            </TableCell>
            <TableCell className="tabular-nums text-muted-foreground">{c.startWeek}</TableCell>
            {publisher && (
              <TableCell className="pr-4 text-right">
                <DeleteButton id={c.id} label={`${c.course}, ${DAYS[c.day]} ${c.startsAt}`} />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
