// The 14 TU Sofia periods of 45 minutes. A class starts at one and ends at one.
// No imports, so the review form in the browser can use the same list as the server.
export const PERIODS: [string, string][] = [
  ['07:30', '08:15'], ['08:30', '09:15'], ['09:30', '10:15'], ['10:30', '11:15'], ['11:30', '12:15'],
  ['12:30', '13:15'], ['13:45', '14:30'], ['14:45', '15:30'], ['15:45', '16:30'], ['16:45', '17:30'],
  ['17:45', '18:30'], ['18:45', '19:30'], ['19:45', '20:30'], ['20:45', '21:30'],
];
export const PERIOD_STARTS = PERIODS.map((p) => p[0]);
export const PERIOD_ENDS = PERIODS.map((p) => p[1]);
