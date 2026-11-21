// What every model is asked, whichever provider answers (Ollama on the laptop, or Gemini).
import type { PlanSource, ScheduleSource } from './client';

export const SCHEDULE_PROMPT = `You read a weekly university timetable from Technical University of Sofia.
Answer with one object per class and per group pattern: course, type (lecture, seminar or lab), day (1 = Monday ... 6 = Saturday),
startsAt and endsAt as HH:MM, room, startWeek and groups (each with name and parity all, odd or even).
Rules: "л." or "Лекция" is a lecture, "л.у." or "Лабораторно упражнение" is a lab, "с.у." is a seminar; the room follows the type.
Lectures are held every week (parity all) from week 1, unless the page says otherwise for that lecture.
Only a class marked "Нечетна седмица" / "Четна седмица", or a cell split diagonally, alternates: give each group its parity.
The notes under the timetable give the week each course's labs start (for example "ПИ – от 2. седмица"): use them as startWeek of those labs; lectures start in week 1.
The room is only its number or name, without the word "Зала". Groups are TU Sofia group numbers such as 221а or 222. Never include names of students or teachers.`;

export const PLAN_PROMPT = `You help a university student in Sofia plan their week around their classes.
1. windows: from the student's instructions, photos and messages, list every time they are busy (work, meetings, travel):
   day (1 = Monday ... 6 = Saturday; "делничните дни" means 1 to 5), from and to as HH:MM, and what in a few words.
2. instructions: only if the student asks in the chat to change what they told you (for example "I don't work on Fridays
   any more"), return the complete new list of their instructions, short sentences in Bulgarian. Otherwise leave it out.
3. subjects: only if the student asks to take a subject with another group, or to drop one, return those subjects with the
   group to attend (one of the groups that have it) or null to drop it. Otherwise leave it out.
4. reply: a short, friendly answer in Bulgarian saying what you understood and what you changed.
Do not decide which classes they can attend; the app does that.`;

/** The user message of a schedule import: the page text (or a note that the timetable is in the photo) and the instructions. */
export function scheduleUserText(source: ScheduleSource): string {
  const user = [source.text ? `Timetable:\n${source.text}` : 'The timetable is in the photo.'];
  if (source.instructions) user.push(`The student's instructions: ${source.instructions}`);
  return user.join('\n\n');
}

/** The first user message of a plan: the group, the subjects with their groups and choices, and the instructions. */
export function planUserText(source: PlanSource): string {
  const instructions = source.instructions.map((t) => `- ${t}`).join('\n') || '(none)';
  const subjects = source.subjects.map((s) => `- ${s.course}, ${s.type}: ${s.groups.join(', ')}; ${s.chosen ?? 'not taken'}`).join('\n');
  return [
    `My group: ${source.myGroup ?? 'not chosen yet'}`,
    `Subjects (course, type: groups that have it; my choice):\n${subjects || '(no timetable yet)'}`,
    `My instructions:\n${instructions}${source.images.length ? '\nMy photos are attached.' : ''}`,
  ].join('\n\n');
}
