import { describe, expect, test } from 'vitest';
import { labelClass, parseWindows } from '../../src/services/windows';

describe('reading busy times from plain words', () => {
  test('weekdays from 9:00 to 16:30', () => {
    const w = parseWindows(['Работя от 9:00 до 16:30 в делничните дни']);
    expect(w.map((x) => x.day)).toEqual([1, 2, 3, 4, 5]);
    expect(w[0]).toEqual({ day: 1, from: '09:00', to: '16:30', what: 'работа' });
  });

  test('named days, a range with a dash, and hours without minutes', () => {
    expect(parseWindows(['Във вторник и четвъртък имам курс 18:00-20:00'])).toEqual([
      { day: 2, from: '18:00', to: '20:00', what: 'друго занятие' },
      { day: 4, from: '18:00', to: '20:00', what: 'друго занятие' },
    ]);
    expect(parseWindows(['В събота работя от 8 до 12 ч.'])).toEqual([{ day: 6, from: '08:00', to: '12:00', what: 'работа' }]);
  });

  test('every day, several sentences, and a time with no day means weekdays', () => {
    expect(parseWindows(['Всеки ден спортувам 7:00-8:00']).map((w) => w.day)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parseWindows(['Среща 12:00-13:00; в петък работя 14:00-18:00'])).toEqual([
      ...[1, 2, 3, 4, 5].map((day) => ({ day, from: '12:00', to: '13:00', what: 'зает' })),
      { day: 5, from: '14:00', to: '18:00', what: 'работа' },
    ]);
  });

  test('"след 17:00" is busy until the evening, "до 12" from the morning, a day with no time all day', () => {
    expect(parseWindows(['В понеделник след 17:00 ч. не мога'])).toEqual([{ day: 1, from: '17:00', to: '21:30', what: 'зает' }]);
    expect(parseWindows(['Във вторник работя до 12'])).toEqual([{ day: 2, from: '07:30', to: '12:00', what: 'работа' }]);
    expect(parseWindows(['В събота не мога'])).toEqual([{ day: 6, from: '07:30', to: '21:30', what: 'зает' }]);
    expect(parseWindows(['В четвъртък от 14 до 18 ч. и след 20:00 съм зает']).map((w) => `${w.from}-${w.to}`)).toEqual(['14:00-18:00', '20:00-21:30']);
    expect(parseWindows(['Чакам до 5 минути', 'Харесвам петък', 'В сряда мога да идвам цял ден'])).toEqual([]); // "до 5" is before the day starts; a day without "не мога" is nothing
  });

  test('being free, counts of weeks or minutes, and questions are not busy times', () => {
    const none = [
      'Вече не работя в петък',
      'В събота не съм зает',
      'В понеделник след 18 съм свободен',
      'След 3 седмици започвам работа',
      'Мога ли да ходя на УП до 10. седмица?',
      'Ходя на КЗ до 12-та седмица',
      'Пътят ми е до 20 минути',
      'Звъня след 2 и чакам до 5', // hours outside the day are not times
    ];
    for (const text of none) expect(parseWindows([text]), text).toEqual([]);
    expect(parseWindows(['Работя от 9 часа до 17 часа'])).toHaveLength(5);
    expect(parseWindows(['Работя от 9 часа до 17 часа'])[0]).toMatchObject({ from: '09:00', to: '17:00' });
    expect(parseWindows(['В понеделник мога, в сряда не мога'])).toEqual([{ day: 3, from: '07:30', to: '21:30', what: 'зает' }]);
  });

  test('numbers that are not times, impossible hours and backwards ranges are ignored', () => {
    expect(parseWindows(['Имам 2-3 часа почивка', 'от 25:00 до 26:00', 'от 18:00 до 9:00'])).toEqual([]);
  });
});

describe('labelling a class', () => {
  const work = [{ day: 1, from: '09:00', to: '16:30', what: 'работа' }];

  test('no overlap: can attend; a lab over work: time off; a lecture over work: email the teacher', () => {
    expect(labelClass({ day: 1, startsAt: '16:45', endsAt: '19:30', type: 'lecture' }, work).label).toBe('can_attend');
    expect(labelClass({ day: 2, startsAt: '10:30', endsAt: '13:15', type: 'lab' }, work).label).toBe('can_attend');
    expect(labelClass({ day: 1, startsAt: '13:45', endsAt: '16:30', type: 'lab' }, work)).toMatchObject({ label: 'time_off' });
    expect(labelClass({ day: 1, startsAt: '07:30', endsAt: '10:15', type: 'lecture' }, work).label).toBe('email');
  });

  test('touching at the edge is not an overlap', () => {
    expect(labelClass({ day: 1, startsAt: '16:30', endsAt: '18:00', type: 'lab' }, work).label).toBe('can_attend');
  });
});
