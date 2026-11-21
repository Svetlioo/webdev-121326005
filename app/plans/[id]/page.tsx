import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/app/app-header';
import { ActionButton, AutoRefresh, ImportForm } from '@/app/client-actions';
import { getActor } from '@/app/session';
import { WeekCalendar } from '@/app/plans/week-calendar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AppError } from '@/src/services/errors';
import { listImports } from '@/src/services/imports';
import { getPlan } from '@/src/services/plans';
import { LAST_WEEK } from '@/src/services/schedule';
import { LABELS } from '@/src/services/windows';
import { WeekNav } from '../week-nav';
import { ChatInput, DeletePlanButton, RemoveButton, ShareDialog, SubjectsPanel } from '../plan-actions';

const DAYS = ['', 'пон', 'вт', 'ср', 'чет', 'пет', 'съб'];
const IMPORT_STATUS = { queued: 'в опашката', processing: 'моделът чете', ready: 'готово за преглед', failed: 'неуспешно', published: 'публикувано' };
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
  const { plan, isOwner, canEdit, sources, messages, shares, subjects, groups: timetableGroups, classes } = view;
  const imports = canEdit ? await listImports(actor, plan.id) : [];
  const instructions = sources.filter((s) => s.text);
  const photos = sources.filter((s) => !s.text);
  const importing = imports.some((i) => i.status === 'queued' || i.status === 'processing');
  const thinking = plan.modelStatus === 'queued' || plan.modelStatus === 'processing';
  // Waiting for more than two minutes means no worker is running (the model lives on the laptop).
  const longAgo = (iso: string | Date) => Date.now() - new Date(iso).getTime() > 120_000;
  const modelOff = thinking && longAgo(plan.updatedAt);

  return (
    <div className="min-h-dvh bg-muted/40">
      {(thinking || importing) && <AutoRefresh key={String(plan.updatedAt)} />}
      <AppHeader actor={actor} current="plans" />
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <Link href="/plans" className="text-sm text-muted-foreground hover:text-foreground">
              ← Моите програми
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">{plan.name}</h1>
            <span className="flex flex-wrap gap-1">
              <Badge variant="secondary">{plan.myGroup ? `група ${plan.myGroup}` : 'без избрана група'}</Badge>
              {isOwner ? (
                <Badge variant="outline">ваша</Badge>
              ) : canEdit ? (
                <Badge variant="outline">на {plan.ownerEmail} · администратор</Badge>
              ) : (
                <Badge variant="outline">само за четене · {plan.ownerEmail}</Badge>
              )}
            </span>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <ShareDialog planId={plan.id} shares={shares} />
              <DeletePlanButton planId={plan.id} />
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          {/* Left: what the plan is built from */}
          <aside className="grid content-start gap-4">
            <section aria-labelledby="timetable-title" className="grid gap-3 rounded-lg border bg-background p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 id="timetable-title" className="text-sm font-medium">
                  Разписание
                </h2>
                <Link href={`/plans/${plan.id}/classes`} className="text-xs whitespace-nowrap text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  Всички занятия и търсене →
                </Link>
              </div>
              {canEdit ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Дайте линк към страницата с разписанието, снимка или и двете. От линка приложението изтегля текста на страницата (без списъците със студенти); моделът го чете, а вие преглеждате и публикувате резултата.
                  </p>
                  <ImportForm planId={plan.id} />
                  {imports.length > 0 && (
                    <ul className="grid gap-1 text-sm">
                      {imports.map((i) => (
                        <li key={i.id} className="grid gap-1 rounded-md border p-2">
                          <span className="flex flex-wrap items-center gap-2">
                            <Badge variant={i.status === 'failed' ? 'destructive' : 'secondary'}>{IMPORT_STATUS[i.status]}</Badge>
                            <span className="min-w-0 truncate text-xs text-muted-foreground">{i.sourceUrl ?? 'снимка'}</span>
                          </span>
                          {i.error && <span className="text-xs text-destructive">{i.error}</span>}
                          {i.status === 'queued' && longAgo(i.createdAt) && (
                            <span className="text-xs text-muted-foreground">Моделът е изключен в момента; внасянето ще продължи, когато се включи.</span>
                          )}
                          {i.status === 'ready' && (
                            <Link href={`/plans/${plan.id}/imports/${i.id}`} className="text-xs underline underline-offset-4">
                              Прегледай и публикувай
                            </Link>
                          )}
                          {i.status === 'failed' && <ActionButton url={`/api/imports/${i.id}/retry`} method="POST" label="Опитай отново" variant="outline" />}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Разписанието е внесено от собственика на програмата.</p>
              )}
            </section>

            {timetableGroups.length > 0 && (
              <section aria-labelledby="subjects-title" className="grid gap-3 rounded-lg border bg-background p-4">
                <h2 id="subjects-title" className="text-sm font-medium">
                  Моята група и предмети
                </h2>
                <p className="text-xs text-muted-foreground">
                  Предметите на вашата група са с нея. Може да ходите на предмет с друга група, която го има, или да го махнете.
                </p>
                <SubjectsPanel planId={plan.id} groups={timetableGroups} myGroup={plan.myGroup} subjects={subjects} disabled={!canEdit} />
              </section>
            )}

            <section aria-labelledby="known-title" className="grid gap-3 rounded-lg border bg-background p-4">
              <h2 id="known-title" className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
                Какво знае AI за вас
                {plan.windowsFrom === 'parser' ? <Badge variant="outline">Приблизително, без AI</Badge> : <Badge variant="secondary">от AI</Badge>}
              </h2>
              {instructions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{canEdit ? 'Още нищо. Пишете в чата: работно време, срещи, с коя група ходите на кой предмет.' : 'Нищо.'}</p>
              ) : (
                <ul className="grid gap-1.5">
                  {instructions.map((s) => (
                    <li key={s.id} className="flex items-start gap-2 rounded-md border px-2 py-1.5 text-sm">
                      <p className="min-w-0 flex-1 whitespace-pre-wrap">{s.text}</p>
                      {canEdit && <RemoveButton url={`/api/plans/${plan.id}/sources/${s.id}`} label={`Махни „${s.text}“`} />}
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="text-xs font-medium text-muted-foreground">Заети часове</h3>
              {plan.windows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Няма.</p>
              ) : (
                <ul className="grid gap-1 text-sm">
                  {plan.windows.map((w, i) => (
                    <li key={i} className="tabular-nums">
                      <span className="inline-block w-8 text-muted-foreground">{DAYS[w.day]}</span> {w.from}–{w.to} · {w.what}
                    </li>
                  ))}
                </ul>
              )}
              {plan.windowsFrom === 'parser' && (
                <p className="text-xs text-muted-foreground">
                  {plan.modelStatus === 'failed'
                    ? 'AI не успя да отговори, затова часовете са по прости правила. Пишете отново в чата.'
                    : modelOff
                      ? 'AI е изключен в момента. Дотогава часовете са по прости правила („от 9 до 16:30“, „след 17:00“, „в събота не мога“).'
                      : 'Докато AI прочете, часовете са по прости правила.'}
                </p>
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
                  {canEdit
                    ? 'Кажете на AI кога сте заети и какво искате, напр. „Работя от 9:00 до 16:30 в делничните дни“ или „УП упражнение ще ходя с 221а“. Може и снимка на график. AI подрежда програмата и я записва вляво.'
                    : 'Няма съобщения.'}
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
                  {thinking && <li className="justify-self-start rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{modelOff ? 'Моделът е изключен в момента; ще отговори, когато се включи.' : 'Моделът мисли…'}</li>}
                </ol>
              )}
              {photos.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="Качени снимки">
                  {photos.map((p) => (
                    <li key={p.id} className="relative">
                      <a href={`/api/plans/${plan.id}/sources/${p.id}`} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/plans/${plan.id}/sources/${p.id}`} alt="Качена снимка" className="size-20 rounded-md border object-cover" />
                      </a>
                      {canEdit && (
                        <span className="absolute -top-2 -right-2 rounded-full bg-background shadow">
                          <RemoveButton url={`/api/plans/${plan.id}/sources/${p.id}`} label="Махни снимката" />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && <ChatInput planId={plan.id} />}
              <p className="text-xs text-muted-foreground">
                Отговаря локалният модел на лаптопа; когато той е изключен, отговаря Gemini на Google и вашите инструкции, снимки и съобщения се изпращат към Google.
              </p>
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
                  <WeekNav planId={plan.id} week={week} last={LAST_WEEK} />
                </div>
              </div>
              {thinking && (
                <p role="status" className="flex items-center gap-2 border-b bg-muted/60 px-4 py-2 text-sm">
                  <span className="size-2 animate-pulse rounded-full bg-primary" />
                  {modelOff ? 'AI е изключен в момента; програмата ще се обнови, когато се включи.' : 'AI обновява програмата… календарът ще се смени сам.'}
                </p>
              )}
              {classes.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {timetableGroups.length === 0
                    ? 'Програмата още няма разписание. Внесете го от „Разписание“ (линк, снимка или и двете).'
                    : !plan.myGroup
                      ? 'Изберете групата си в „Моята група и предмети“.'
                      : 'Няма занятия тази седмица.'}
                </p>
              ) : (
                <>
                  <div className="week-calendar hidden p-2 md:block">
                    <WeekCalendar classes={classes} week={week} canEdit={canEdit} />
                  </div>
                  <ul className="divide-y md:hidden">
                    {classes.map((c) => (
                      <li key={c.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${c.label ? LABEL_DOT[c.label] : 'bg-muted-foreground'}`} />
                        <div className="min-w-0">
                          <p className="font-mono text-xs tabular-nums text-muted-foreground">
                            {DAYS[c.day]} {c.startsAt}–{c.endsAt} · зала {c.room}
                          </p>
                          <p className={c.cancelled || c.skipped ? 'line-through' : ''}>
                            <span className="font-medium">{c.course}</span> · {c.label ? LABELS[c.label] : c.cancelled ? 'Отменено' : 'Не ходя'}
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
