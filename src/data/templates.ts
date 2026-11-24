// The sample timetable a student can start a plan from: the ФКСТ КСИ master's winter 2026/27
// schedule, copied from the official page. Timetable only, never the student lists.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NewEntry, Parity } from './entries';

const FILE = join(process.cwd(), 'db', 'seed', 'fkst-ksi-mag-2026-winter.json');

type SeedEntry = Omit<NewEntry, 'groups'> & { groups: [string, Parity][] };

export const SAMPLE_TITLE = 'ФКСТ, КСИ, магистри, зимен семестър 2026/2027';

export async function sampleTimetable(): Promise<NewEntry[]> {
  const seed: { entries: SeedEntry[] } = JSON.parse(await readFile(FILE, 'utf8'));
  return seed.entries.map((e) => ({ ...e, groups: e.groups.map(([name, parity]) => ({ name, parity })) }));
}
