import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/app/app-header';
import { AutoRefresh } from '@/app/imports/actions';
import { getActor } from '@/app/session';
import { WeekCalendar } from '@/app/week/week-calendar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { AppError } from '@/src/services/errors';
import { getPlan } from '@/src/services/plans';
import { LAST_WEEK } from '@/src/services/schedule';
import { LABELS } from '@/src/services/windows';
import { AddSource, ChatInput, DeletePlanButton, RemoveButton, ShareDialog } from '../plan-actions';

const DAYS = ['', 'пон', 'вт', 'ср', 'чет', 'пет', 'съб'];
const LABEL_DOT = { can_attend: 'bg-emerald-500', time_off: 'bg-amber-500', email: 'bg-red-500' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ week?: string }> };

export default async function PlanPage({ params, searchParams }: Props) {
  const actor = await getActor();
  if (!actor) redirect('/signin');
  const id = Number((await params).id);
  const week = Number((await searchParams).week ?? 1);
  let view;
  try {
    view = await getPlan(actor, id, week);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    if (error instanceof AppError) {
      return (
        <div className="min-h-dvh bg-muted/40">
          <AppHeader actor={actor} current="plans" />
          <main className="mx-auto max-w-md px-4 py-16">
            <Alert variant="destructive">
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          </main>
        </div>
      );
    }
    throw error;
  }
  const { plan, isOwner, sources, messages, shares, classes } = view;
  const thinking = plan.modelStatus === 'queued' || plan.modelStatus === 'processing';
  const weekHref = (w: number) => `/plans/${plan.id}?week=${w}`;

  return (
    <div className="min-h-dvh bg-muted/40">
      {thinking && <AutoRefresh />}
      <AppHeader actor={actor} current="plans" />
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <Link href="/plans" className="text-sm text-muted-foreground hover:text-foreground">
              ← Моите програми
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">{plan.name}</h1>
            <span className="flex flex-wrap gap-1">
              <Badge variant="secondary">група {plan.groupName}</Badge>
              {isOwner ? <Badge variant="outline">ваша</Badge> : <Badge variant="outline">само за четене · {plan.ownerEmail}</Badge>}
            </span>
          </div>
          {isOwner && (
            <div className="flex gap-2">
              <ShareDialog planId={plan.id} shares={shares} />
              <DeletePlanButton planId={plan.id} />
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          {/* Left: what the plan is built from */}
          <aside className="grid content-start gap-4">
            <section aria-labelledby="sources-title" className="grid gap-3 rounded-lg border bg-background p-4">
              <h2 id="sources-title" className="text-sm font-medium">
                Източници
              </h2>
              {isOwner && <AddSource planId={plan.id} />}
              {sources.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {isOwner ? 'Добавете работното си време, срещи или снимка на график.' : 'Няма източници.'}
                </p>
              ) : (
                <ul className="grid gap-2">
                  {sources.map((s) => (
                    <li key={s.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                      {s.text ? (
                        <p className="min-w-0 flex-1 whitespace-pre-wrap">{s.text}</p>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/plans/${plan.id}/sources/${s.id}`} alt="Качена снимка" className="max-h-40 min-w-0 flex-1 rounded object-contain" />
                      )}
                      {isOwner && <RemoveButton url={`/api/plans/${plan.id}/sources/${s.id}`} label="Премахни източника" />}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="windows-title" className="grid gap-2 rounded-lg border bg-background p-4">
              <h2 id="windows-title" className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
                Заети часове
                {plan.windowsFrom === 'parser' ? (
                  <Badge variant="outline">Изчислено без модела</Badge>
                ) : (
                  <Badge variant="secondary">от модела</Badge>
                )}
              </h2>
              {thinking && (
                <p className="text-xs text-muted-foreground">
                  Програмата вече работи. Моделът ще я прегледа, когато е включен, и ще уточни часовете.
                </p>
              )}
              {plan.modelStatus === 'failed' && (
                <p className="text-xs text-muted-foreground">Моделът не успя да отговори, затова часовете са изчислени без него.</p>
              )}
              {plan.windows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Още няма заети часове.</p>
              ) : (
                <ul className="grid gap-1 text-sm">
                  {plan.windows.map((w, i) => (
                    <li key={i} className="tabular-nums">
                      <span className="inline-block w-8 text-muted-foreground">{DAYS[w.day]}</span> {w.from}–{w.to} · {w.what}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>

          {/* Right: the chat and the week */}
          <div className="grid min-w-0 content-start gap-4">
            <section aria-labelledby="chat-title" className="grid gap-3 rounded-lg border bg-background p-4">
              <h2 id="chat-title" className="text-sm font-medium">
                Чат с модела
              </h2>
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {isOwner ? 'Опишете седмицата си с думи. Моделът ще извади заетите ви часове.' : 'Няма съобщения.'}
                </p>
              ) : (
                <ol className="grid max-h-72 gap-2 overflow-y-auto">
                  {messages.map((m) => (
                    <li
                      key={m.id}
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'justify-self-end bg-primary text-primary-foreground' : 'justify-self-start bg-muted'}`}
                    >
                      {m.content}
                    </li>
                  ))}
                  {thinking && <li className="justify-self-start rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Чака модела…</li>}
                </ol>
              )}
              {isOwner && <ChatInput planId={plan.id} />}
            </section>

            <section aria-labelledby="plan-week-title" className="rounded-lg border bg-background">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
                <h2 id="plan-week-title" className="text-sm font-medium">
                  {week}. седмица ({week % 2 ? 'нечетна' : 'четна'})
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  {Object.entries(LABELS).map(([key, text]) => (
                    <span key={key} className="inline-flex items-center gap-1">
                      <span className={`size-2 rounded-full ${LABEL_DOT[key as keyof typeof LABEL_DOT]}`} />
                      {text}
                    </span>
                  ))}
                  <nav aria-label="Седмици" className="flex gap-1">
                    {week > 1 && (
                      <Link href={weekHref(week - 1)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                        ‹ {week - 1}.
                      </Link>
                    )}
                    {week < LAST_WEEK && (
                      <Link href={weekHref(week + 1)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                        {week + 1}. ›
                      </Link>
                    )}
                  </nav>
                </div>
              </div>
              {classes.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Няма занятия тази седмица.</p>
              ) : (
                <>
                  <div className="week-calendar hidden p-2 md:block">
                    <WeekCalendar classes={classes} week={week} publisher={false} />
                  </div>
                  <ul className="divide-y md:hidden">
                    {classes.map((c) => (
                      <li key={c.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${c.label ? LABEL_DOT[c.label] : 'bg-muted-foreground'}`} />
                        <div className="min-w-0">
                          <p className="font-mono text-xs tabular-nums text-muted-foreground">
                            {DAYS[c.day]} {c.startsAt}–{c.endsAt} · зала {c.room}
                          </p>
                          <p className={c.cancelled ? 'line-through' : ''}>
                            <span className="font-medium">{c.course}</span> · {c.label ? LABELS[c.label] : 'Отменено'}
                          </p>
                          <p className="text-xs text-muted-foreground">{c.reason}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
