'use client';

import bgLocale from '@fullcalendar/core/locales/bg';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { useMemo, useState } from 'react';
import type { EventContentArg } from '@fullcalendar/core';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { WeekClass } from '@/src/services/schedule';
import { LABELS, type Label } from '@/src/services/windows';
import { NoteForm } from './note-form';

const DAYS = ['', 'Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота'];
const TYPES = { lecture: 'Лекция', seminar: 'Семинар', lab: 'Упражнение' };

// The schedule knows week numbers, not dates, so every week is drawn on the same
// reference week: Monday 5 January 2026 is day 1. Only the weekday names are shown.
const REFERENCE_MONDAY = 5;
/** A class, and on a plan page its label ("can attend" and so on) with the reason. */
export type CalendarClass = WeekClass & { label?: Label | null; reason?: string };

const dateOf = (day: number, time: string) => `2026-01-${String(REFERENCE_MONDAY + day - 1).padStart(2, '0')}T${time}:00`;

/** What one class shows inside its box in the calendar. */
function ClassBox({ event, timeText }: EventContentArg) {
  const c = event.extendedProps.entry as CalendarClass;
  return (
    <div className="flex h-full flex-col gap-0.5 overflow-hidden p-1 text-xs leading-tight">
      <span className="font-semibold">{c.course}</span>
      <span>
        {TYPES[c.type]} · зала {c.room}
      </span>
      <span className="opacity-80">{timeText}</span>
      {c.cancelled && <span className="font-semibold">Отменено</span>}
      {c.label && <span className="font-semibold">{LABELS[c.label]}</span>}
      {!c.cancelled && !c.label && c.notes.length > 0 && <span className="truncate italic">{c.notes[0].text}</span>}
    </div>
  );
}

/** The week as a Teams-like calendar. Clicking a class opens its details and, for a publisher, the note form. */
export function WeekCalendar({ classes, week, publisher }: { classes: CalendarClass[]; week: number; publisher: boolean }) {
  const [openId, setOpenId] = useState<number | null>(null);
  // Looked up from the props, so a note added in the dialog shows after the page refreshes.
  const open = classes.find((c) => c.id === openId);
  // Built once per change of classes, so opening the dialog does not redraw every event.
  const events = useMemo(
    () =>
      classes.map((c) => ({
        id: String(c.id),
        title: c.course,
        start: dateOf(c.day, c.startsAt),
        end: dateOf(c.day, c.endsAt),
        // On a plan page the colour says the label; on the week view it says the kind of class.
        classNames: [c.label ? `label-${c.label}` : `class-${c.type}`, ...(c.cancelled ? ['class-cancelled'] : [])],
        extendedProps: { entry: c },
      })),
    [classes],
  );

  return (
    <>
      <FullCalendar
        plugins={[timeGridPlugin]}
        initialView="timeGridWeek"
        initialDate={dateOf(1, '07:30')}
        locale={bgLocale}
        firstDay={1}
        hiddenDays={[0]}
        headerToolbar={false}
        dayHeaderFormat={{ weekday: 'long' }}
        allDaySlot={false}
        slotMinTime="07:30:00"
        slotMaxTime="21:30:00"
        slotDuration="00:30:00"
        slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        nowIndicator={false}
        height="auto"
        expandRows
        events={events}
        eventContent={ClassBox}
        eventClick={({ event }) => setOpenId(Number(event.id))}
      />

      <Dialog open={open !== undefined} onOpenChange={(isOpen) => !isOpen && setOpenId(null)}>
        {open && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle className={open.cancelled ? 'line-through' : ''}>
                {open.course} · {TYPES[open.type]}
              </DialogTitle>
              <DialogDescription>
                {DAYS[open.day]}, {open.startsAt}–{open.endsAt} · зала {open.room} · {week}. седмица
              </DialogDescription>
            </DialogHeader>
            {open.label && (
              <p className="text-sm">
                <span className="font-medium">{LABELS[open.label]}.</span> {open.reason}
              </p>
            )}
            <p className="text-sm">
              Групи: {open.groups.map((g) => g.name).join(', ')}
              {open.startWeek > 1 && ` · от ${open.startWeek}. седмица`}
            </p>
            {open.notes.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {open.notes.map((n) => (
                  <Badge key={n.id} variant={open.cancelled ? 'destructive' : 'secondary'}>
                    {n.text}
                    {n.week === null && ' (всяка седмица)'}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Няма бележки.</p>
            )}
            {publisher && <NoteForm entryId={open.id} week={week} label={`${open.course}, ${DAYS[open.day]} ${open.startsAt}`} />}
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
