// An in-memory stand-in for the data layer (plans, their timetables, notes, sources, chat, shares),
// so service, API and MCP tests check the rules and what ends up stored, without a database.
// Each test file still declares vi.mock(...) for the modules; installFakes() fills them in.
import { vi } from 'vitest';
import * as entries from '../src/data/entries';
import type { Entry, NewEntry } from '../src/data/entries';
import * as notes from '../src/data/notes';
import type { Note } from '../src/data/notes';
import * as plans from '../src/data/plans';
import type { Plan } from '../src/data/plans';
import * as users from '../src/data/users';

export const ana = { id: 'ana', role: 'student' };
export const boris = { id: 'boris', role: 'student' };
export const vera = { id: 'vera', role: 'student' };
export const admin = { id: 'admin', role: 'admin' };

export type Store = {
  plans: Plan[];
  entries: (Entry & { planId: number })[];
  notes: (Note & { planId: number })[];
  sources: { id: number; planId: number; text: string | null; image?: Buffer; imageType: string | null }[];
  messages: { id: number; planId: number; role: 'user' | 'assistant'; content: string }[];
  shares: { planId: number; userId: string }[];
};

export function installFakes(): Store {
  const db: Store = { plans: [], entries: [], notes: [], sources: [], messages: [], shares: [] };
  const plan = (id: number) => db.plans.find((p) => p.id === id)!;
  const strip = <T extends { planId: number }>({ planId: _planId, ...rest }: T) => rest;

  vi.mocked(entries.listEntries).mockImplementation(async (planId) => structuredClone(db.entries.filter((e) => e.planId === planId).map(strip)));
  vi.mocked(entries.findEntryPlan).mockImplementation(async (id) => db.entries.find((e) => e.id === id)?.planId ?? null);
  vi.mocked(entries.deleteEntry).mockImplementation(async (id) => {
    const before = db.entries.length;
    db.entries = db.entries.filter((e) => e.id !== id);
    return db.entries.length < before;
  });
  vi.mocked(entries.insertEntries).mockImplementation(async (planId, list: NewEntry[]) => {
    for (const e of list) db.entries.push({ ...(e as Entry), id: db.entries.length + 1, planId });
  });

  vi.mocked(notes.listNotes).mockImplementation(async (planId) => db.notes.filter((n) => n.planId === planId).map(strip));
  vi.mocked(notes.insertNote).mockImplementation(async (entryId, week, text) => {
    const note = { id: db.notes.length + 1, entryId, week, text };
    db.notes.push({ ...note, planId: db.entries.find((e) => e.id === entryId)!.planId });
    return note;
  });

  vi.mocked(users.findUserIdByEmail).mockImplementation(async (email) => (/^(ana|boris|vera|admin)@test\.bg$/.test(email) ? email.split('@')[0] : null));

  vi.mocked(plans.insertPlan).mockImplementation(async (ownerId, name, myGroup) => {
    db.plans.push({ id: db.plans.length + 1, ownerId, ownerEmail: `${ownerId}@test.bg`, name, myGroup, subjects: {}, windows: [], windowsFrom: 'parser', modelStatus: 'idle' });
    return db.plans.length;
  });
  vi.mocked(plans.findPlan).mockImplementation(async (id) => structuredClone(db.plans.find((p) => p.id === id) ?? null));
  vi.mocked(plans.listPlansFor).mockImplementation(async (userId) => ({
    own: db.plans.filter((p) => p.ownerId === userId),
    shared: db.plans.filter((p) => db.shares.some((s) => s.planId === p.id && s.userId === userId)),
  }));
  vi.mocked(plans.listOtherPlans).mockImplementation(async (userId) => db.plans.filter((p) => p.ownerId !== userId));
  vi.mocked(plans.isSharedWith).mockImplementation(async (planId, userId) => db.shares.some((s) => s.planId === planId && s.userId === userId));
  vi.mocked(plans.setMyGroup).mockImplementation(async (id, group) => void (plan(id).myGroup = group));
  vi.mocked(plans.setSubjects).mockImplementation(async (id, subjects) => void (plan(id).subjects = subjects));
  vi.mocked(plans.deletePlan).mockImplementation(async (id) => void (db.plans = db.plans.filter((p) => p.id !== id)));
  vi.mocked(plans.saveWindows).mockImplementation(async (id, windows, from, status) => {
    Object.assign(plan(id), { windows, windowsFrom: from, modelStatus: status });
  });
  vi.mocked(plans.applyModelAnswer).mockImplementation(async (id, answer) => {
    if (plan(id).modelStatus !== 'processing') return false;
    Object.assign(plan(id), { windows: answer.windows, windowsFrom: 'model', modelStatus: 'idle' });
    if (answer.subjects) plan(id).subjects = answer.subjects;
    if (answer.instructions) {
      db.sources = db.sources.filter((s) => !(s.planId === id && s.text !== null));
      for (const text of answer.instructions) db.sources.push({ id: db.sources.length + 100, planId: id, text, imageType: null });
    }
    return true;
  });
  vi.mocked(plans.failPlan).mockImplementation(async (id) => {
    if (plan(id).modelStatus === 'processing') plan(id).modelStatus = 'failed';
  });
  vi.mocked(plans.claimNextPlan).mockImplementation(async () => {
    const next = db.plans.find((p) => p.modelStatus === 'queued');
    if (next) next.modelStatus = 'processing';
    return next?.id ?? null;
  });
  vi.mocked(plans.listSources).mockImplementation(async (planId) =>
    db.sources.filter((s) => s.planId === planId).map(({ id, text, imageType }) => ({ id, text, imageType })),
  );
  vi.mocked(plans.listSourceImages).mockImplementation(async (planId) =>
    db.sources.filter((s) => s.planId === planId && s.image).map((s) => ({ data: s.image!, type: s.imageType! })),
  );
  vi.mocked(plans.findSourceImage).mockImplementation(async (planId, id) => {
    const s = db.sources.find((x) => x.planId === planId && x.id === id && x.image);
    return s ? { data: s.image!, type: s.imageType! } : null;
  });
  vi.mocked(plans.insertSource).mockImplementation(async (planId, s) => {
    const id = db.sources.length + 1;
    db.sources.push('text' in s ? { id, planId, text: s.text, imageType: null } : { id, planId, text: null, image: s.image, imageType: s.imageType });
  });
  vi.mocked(plans.deleteSource).mockImplementation(async (planId, id) => {
    const before = db.sources.length;
    db.sources = db.sources.filter((s) => !(s.planId === planId && s.id === id));
    return db.sources.length < before;
  });
  vi.mocked(plans.listMessages).mockImplementation(async (planId) =>
    db.messages.filter((m) => m.planId === planId).map(({ id, role, content }) => ({ id, role, content })),
  );
  vi.mocked(plans.insertMessage).mockImplementation(async (planId, role, content) => void db.messages.push({ id: db.messages.length + 1, planId, role, content }));
  vi.mocked(plans.listShares).mockImplementation(async (planId) =>
    db.shares.filter((s) => s.planId === planId).map((s) => ({ userId: s.userId, email: `${s.userId}@test.bg` })),
  );
  vi.mocked(plans.addShare).mockImplementation(async (planId, userId) => void db.shares.push({ planId, userId }));
  vi.mocked(plans.removeShare).mockImplementation(async (planId, userId) => void (db.shares = db.shares.filter((s) => !(s.planId === planId && s.userId === userId))));
  return db;
}
