'use client';

import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useAction } from '@/app/client-actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PERIOD_ENDS, PERIOD_STARTS } from '@/src/services/periods';

type Parity = 'all' | 'odd' | 'even';
export type FormClass = {
  course: string;
  type: string;
  day: number;
  startsAt: string;
  endsAt: string;
  room: string;
  startWeek: number;
  groups: { name: string; parity: Parity }[];
};

const EMPTY: FormClass = { course: '', type: 'lecture', day: 1, startsAt: '07:30', endsAt: '10:15', room: '', startWeek: 1, groups: [{ name: '', parity: 'all' }] };
const DAYS = ['Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота'];
const select = 'h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm';

/** Adds a class to a draft under review (no index) or changes one, with the 14 periods as the only times to pick. */
export function ClassForm({ importId, index, initial }: { importId: number; index?: number; initial?: FormClass }) {
  const { busy, error, run } = useAction();
  const [open, setOpen] = useState(false);
  const [c, setC] = useState<FormClass>(initial ?? EMPTY);
  const set = (patch: Partial<FormClass>) => setC((old) => ({ ...old, ...patch }));
  const setGroup = (i: number, patch: Partial<FormClass['groups'][number]>) =>
    set({ groups: c.groups.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
  const editing = index !== undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (isOpen) setC(initial ?? EMPTY);
      }}
    >
      <DialogTrigger render={<Button variant={editing ? 'ghost' : 'outline'} size="sm" />}>
        {editing ? 'Промени' : (
          <>
            <Plus data-icon="inline-start" />
            Добави занятие
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Промени занятието' : 'Ново занятие'}</DialogTitle>
          <DialogDescription>Проверява се със същите правила като прочетеното от модела.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const url = editing ? `/api/imports/${importId}/classes/${index}` : `/api/imports/${importId}/classes`;
            run(url, { method: editing ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) }, () => setOpen(false));
          }}
        >
          <label className="grid gap-1">
            Предмет
            <Input value={c.course} onChange={(e) => set({ course: e.target.value })} placeholder="напр. ПИ" required />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1">
              Вид
              <select className={select} value={c.type} onChange={(e) => set({ type: e.target.value })}>
                <option value="lecture">лекция</option>
                <option value="seminar">семинар</option>
                <option value="lab">упражнение</option>
              </select>
            </label>
            <label className="grid gap-1">
              Ден
              <select className={select} value={c.day} onChange={(e) => set({ day: Number(e.target.value) })}>
                {DAYS.map((d, i) => (
                  <option key={d} value={i + 1}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              От
              <select className={select} value={c.startsAt} onChange={(e) => set({ startsAt: e.target.value })}>
                {PERIOD_STARTS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              До
              <select className={select} value={c.endsAt} onChange={(e) => set({ endsAt: e.target.value })}>
                {PERIOD_ENDS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              Зала
              <Input value={c.room} onChange={(e) => set({ room: e.target.value })} placeholder="напр. 1211" required />
            </label>
            <label className="grid gap-1">
              От седмица
              <Input type="number" min={1} max={15} value={c.startWeek} onChange={(e) => set({ startWeek: Number(e.target.value) })} />
            </label>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1">Групи</legend>
            {c.groups.map((g, i) => (
              <div key={i} className="flex gap-2">
                <Input value={g.name} onChange={(e) => setGroup(i, { name: e.target.value })} placeholder="напр. 222 или 221а" aria-label={`Група ${i + 1}`} required />
                <select className={`${select} max-w-36`} value={g.parity} onChange={(e) => setGroup(i, { parity: e.target.value as Parity })} aria-label={`Седмици на група ${i + 1}`}>
                  <option value="all">всяка седмица</option>
                  <option value="odd">нечетни</option>
                  <option value="even">четни</option>
                </select>
                {c.groups.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" aria-label={`Махни група ${i + 1}`} onClick={() => set({ groups: c.groups.filter((_, j) => j !== i) })}>
                    <X />
                  </Button>
                )}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => set({ groups: [...c.groups, { name: '', parity: 'all' }] })}>
              <Plus data-icon="inline-start" />
              група
            </Button>
          </fieldset>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {editing ? 'Запази' : 'Добави'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
