// The rules of a personal plan that need no model: reading busy times from plain Bulgarian,
// and labelling every class against those times. The label is always computed here, so a class
// that overlaps a busy time is never "can attend", whatever the model says.
import type { Entry } from '../data/entries';
import type { TimeWindow } from '../model/schemas';

const DAY_WORDS: [RegExp, number[]][] = [
  [/делнич|всеки работен ден|работните дни|пон(еделник)?\s*[-–до]+\s*пет(ък)?/i, [1, 2, 3, 4, 5]],
  [/всеки ден|всички дни|цялата седмица/i, [1, 2, 3, 4, 5, 6]],
];
const DAYS: [RegExp, number][] = [
  [/понеделник/i, 1],
  [/вторник/i, 2],
  [/сряда|сряди/i, 3],
  [/четвъртък/i, 4],
  [/петък/i, 5],
  [/събот/i, 6],
];
// "от 9:00 до 16:30", "9:00-16:30", "от 9 до 13 ч."
const RANGE = /(от\s*)?(\d{1,2})(?:[:.](\d{2}))?\s*(?:ч\.?)?\s*(?:до|-|–|—)\s*(\d{1,2})(?:[:.](\d{2}))?/gi;

const hhmm = (h: string, m = '00') => `${h.padStart(2, '0')}:${m}`;

/** Busy windows from instructions in plain words. A sentence with a time range and no day means weekdays. */
export function parseWindows(texts: string[]): TimeWindow[] {
  const windows: TimeWindow[] = [];
  // Sentences, and the parts of one joined by ", а" / ", но"; a dot after "ч" is not the end of one.
  for (const sentence of texts.flatMap((t) => t.split(/[\n;]+|(?<!ч)\.\s+|,\s*(?:а|но)\s+/))) {
    let days = DAY_WORDS.find(([re]) => re.test(sentence))?.[1];
    days ??= DAYS.filter(([re]) => re.test(sentence)).map(([, d]) => d);
    if (days.length === 0) days = [1, 2, 3, 4, 5];
    const what = /работ/i.test(sentence) ? 'работа' : /лекци|курс|час/i.test(sentence) ? 'друго занятие' : 'зает';
    for (const m of sentence.matchAll(RANGE)) {
      const [, from, h1, m1, h2, m2] = m;
      if (!from && !m1 && !m2) continue; // "2-3" alone is not a time
      const window = { from: hhmm(h1, m1), to: hhmm(h2, m2) };
      if (Number(h1) > 23 || Number(h2) > 23 || window.from >= window.to) continue;
      for (const day of days) windows.push({ day, ...window, what });
    }
  }
  return windows;
}

export type Label = 'can_attend' | 'time_off' | 'email';
export const LABELS: Record<Label, string> = {
  can_attend: 'Може да присъства',
  time_off: 'Трябва отпуска',
  email: 'Пишете на преподавателя',
};

/** The label of one class: no overlap is "can attend"; a lab or seminar over a busy time needs time off,
 *  because attendance is required; a lecture over a busy time is worth an email to the teacher. */
export function labelClass(c: Pick<Entry, 'day' | 'startsAt' | 'endsAt' | 'type'>, windows: TimeWindow[]): { label: Label; reason: string } {
  const clash = windows.find((w) => w.day === c.day && c.startsAt < w.to && w.from < c.endsAt);
  if (!clash) return { label: 'can_attend', reason: 'Не се засича с нищо от инструкциите ви.' };
  const when = `${clash.what} ${clash.from}–${clash.to}`;
  if (c.type === 'lecture') return { label: 'email', reason: `Засича се с ${when}. Попитайте преподавателя дали лекцията е задължителна.` };
  return { label: 'time_off', reason: `Засича се с ${when}, а упражненията са задължителни.` };
}
