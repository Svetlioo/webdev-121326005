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
// "от 9:00 до 16:30", "9:00-16:30", "от 9 до 13 ч.", "от 9 часа до 17 часа"
const RANGE = /(от\s*)?(\d{1,2})(?:[:.](\d{2}))?\s*(?:ч\.?|часа?)?\s*(?:до|-|–|—)\s*(\d{1,2})(?:[:.](\d{2}))?/gi;
// After "след 17" or "до 12": a count of something else ("до 10. седмица", "до 20 минути", "12-та") is not a time.
const NOT_A_TIME = String.raw`(?![.\d]*\s*(?:-?(?:ти|ви|ри|та|ия)(?![а-я])|седмиц|ден|дни|минут|души|пъти|месец|години))`;
const AFTER = new RegExp(String.raw`след\s*(\d{1,2})(?:[:.](\d{2}))?` + NOT_A_TIME, 'gi');
const UNTIL = new RegExp(String.raw`(?<![а-яa-z])до\s*(\d{1,2})(?:[:.](\d{2}))?` + NOT_A_TIME, 'gi');
// A sentence that says the student is free is not a busy time.
const FREE = /не работя|не съм зает|не съм заета|свобод/i;
const DAY_HOUR = (h: string) => Number(h) >= 7 && Number(h) <= 21;

const DAY_START = '07:30';
const DAY_END = '21:30';
const hhmm = (h: string, m = '00') => `${h.padStart(2, '0')}:${m}`;

/** Busy windows from instructions in plain words. A sentence with a time range and no day means weekdays. */
export function parseWindows(texts: string[]): TimeWindow[] {
  const windows: TimeWindow[] = [];
  // Sentences (a dot and a capital letter; not "ч. " or "10. седмица"), and the parts joined by ", а", ", но" or ", в".
  for (const sentence of texts.flatMap((t) => t.split(/[\n;]+|(?<!ч)\.\s+(?=[А-ЯA-Z])|,\s*(?:а|но)\s+|,\s*(?=(?:в|във)\s)/))) {
    if (FREE.test(sentence)) continue;
    let days = DAY_WORDS.find(([re]) => re.test(sentence))?.[1];
    days ??= DAYS.filter(([re]) => re.test(sentence)).map(([, d]) => d);
    const namedDays = days.length > 0;
    if (!namedDays) days = [1, 2, 3, 4, 5];
    const what = /работ/i.test(sentence) ? 'работа' : /лекци|курс|час/i.test(sentence) ? 'друго занятие' : 'зает';
    const found: { from: string; to: string }[] = [];
    let rest = sentence;
    for (const m of sentence.matchAll(RANGE)) {
      const [text, from, h1, m1, h2, m2] = m;
      rest = rest.replace(text, ' ');
      if (!from && !m1 && !m2) continue; // "2-3" alone is not a time
      found.push({ from: hhmm(h1, m1), to: hhmm(h2, m2) });
    }
    // "след 17:00" is busy until the end of the day; "до 12" (with no "от") is busy from the start.
    for (const m of rest.matchAll(AFTER)) if (DAY_HOUR(m[1])) found.push({ from: hhmm(m[1], m[2]), to: DAY_END });
    for (const m of rest.matchAll(UNTIL)) if (DAY_HOUR(m[1])) found.push({ from: DAY_START, to: hhmm(m[1], m[2]) });
    // "в събота не мога" with no time is the whole day.
    if (found.length === 0 && namedDays && /не мога|зает|заета|ангажиран|цял ден на работа|на работа цял ден/i.test(sentence)) found.push({ from: DAY_START, to: DAY_END });
    for (const w of found) {
      if (w.from >= w.to || w.to > '23:59') continue; // backwards, or an hour such as 25
      for (const day of days) windows.push({ day, ...w, what });
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
