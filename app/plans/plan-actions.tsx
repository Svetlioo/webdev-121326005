'use client';

import { ImagePlus, Send, Share2, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAction } from '@/app/client-actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const Problem = ({ text }: { text: string }) =>
  text ? (
    <p role="alert" className="text-sm text-destructive">
      {text}
    </p>
  ) : null;

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** A new plan: a name, and whether to start from the sample timetable. Opens it once it exists. */
export function CreatePlanForm({ sampleTitle }: { sampleTitle: string }) {
  const router = useRouter();
  const { busy, error, run } = useAction();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const body = { name: form.get('name'), fromSample: form.get('fromSample') === 'on' };
        run('/api/plans', json('POST', body), (created) => router.push(`/plans/${created.id}`));
      }}
    >
      <label className="grid gap-1 text-sm sm:col-span-2">
        Име на програмата
        <Input name="name" required maxLength={100} placeholder="напр. Зимен семестър" />
      </label>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" name="fromSample" />
        Започни от примерното разписание: {sampleTitle}
      </label>
      <Button type="submit" disabled={busy}>
        Създай програма
      </Button>
      <div className="sm:col-span-2">
        <Problem text={error} />
      </div>
    </form>
  );
}

const TYPE = { lecture: 'лекция', seminar: 'семинар', lab: 'упражнение' } as const;

/** The student's group, and for every subject which group's sessions they attend, or none. */
export function SubjectsPanel(props: {
  planId: number;
  groups: string[];
  myGroup: string | null;
  subjects: { key: string; course: string; type: keyof typeof TYPE; groups: string[]; chosen: string | null; byDefault: boolean }[];
  disabled: boolean;
}) {
  const { busy, error, run } = useAction();
  const patch = (body: unknown) => run(`/api/plans/${props.planId}`, json('PATCH', body));
  const select = 'h-8 rounded-lg border border-input bg-transparent px-2 text-sm disabled:opacity-60';
  return (
    <div className="grid gap-3">
      <label className="flex flex-wrap items-center justify-between gap-2 text-sm">
        Моята група
        <select
          className={select}
          value={props.myGroup ?? ''}
          disabled={props.disabled || busy}
          onChange={(e) => patch({ myGroup: e.target.value })}
        >
          <option value="" disabled>
            изберете
          </option>
          {props.groups.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </label>
      {props.myGroup && (
        <ul className="grid gap-1.5">
          {props.subjects.map((s) => (
            <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className={s.chosen ? '' : 'text-muted-foreground'}>
                {s.course} <span className="text-xs text-muted-foreground">{TYPE[s.type]}</span>
              </span>
              <select
                className={select}
                value={s.chosen ?? ''}
                disabled={props.disabled || busy}
                aria-label={`Група за ${s.course}, ${TYPE[s.type]}`}
                onChange={(e) => patch({ subject: { course: s.course, type: s.type, group: e.target.value || null } })}
              >
                {s.groups.map((g) => (
                  <option key={g} value={g}>
                    с {g}
                    {g === props.myGroup ? ' (моята)' : ''}
                  </option>
                ))}
                <option value="">Не го взимам</option>
              </select>
            </li>
          ))}
        </ul>
      )}
      <Problem text={error} />
    </div>
  );
}

/** Adds an instruction in plain words, or a photo. */
export function AddSource({ planId }: { planId: number }) {
  const { busy, error, run } = useAction();
  const [text, setText] = useState('');
  const send = (body: FormData, after?: () => void) => run(`/api/plans/${planId}/sources`, { method: 'POST', body }, after);
  return (
    <div className="grid gap-2">
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const body = new FormData();
          body.set('text', text);
          send(body, () => setText(''));
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="напр. Работя от 9:00 до 16:30 в делничните дни"
          aria-label="Инструкция"
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={busy || !text.trim()}>
            Добави инструкция
          </Button>
          <Button render={<label />} nativeButton={false} variant="outline" size="sm" className="cursor-pointer" aria-disabled={busy}>
            <ImagePlus data-icon="inline-start" />
            Качи снимка
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label="Качи снимка"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const body = new FormData();
                body.set('photo', file);
                send(body);
                e.target.value = '';
              }}
            />
          </Button>
        </div>
      </form>
      <Problem text={error} />
    </div>
  );
}

/** A small × that sends one request, such as removing a source or a share. */
export function RemoveButton({ url, label }: { url: string; label: string }) {
  const { busy, error, run } = useAction();
  return (
    <span className="inline-flex items-center gap-1">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button variant="ghost" size="icon-sm" disabled={busy} aria-label={label} title={label} onClick={() => run(url, { method: 'DELETE' })}>
        <X />
      </Button>
    </span>
  );
}

/** The chat input: a message to the model about the plan. */
export function ChatInput({ planId }: { planId: number }) {
  const { busy, error, run } = useAction();
  const [text, setText] = useState('');
  return (
    <form
      className="grid gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        run(`/api/plans/${planId}/messages`, json('POST', { text }), () => setText(''));
      }}
    >
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          placeholder="Напишете на модела, напр. „и в събота съм на работа до 12“"
          aria-label="Съобщение"
        />
        <Button type="submit" size="icon" disabled={busy || !text.trim()} aria-label="Изпрати">
          <Send />
        </Button>
      </div>
      <Problem text={error} />
    </form>
  );
}

/** The owner's share dialog: who can read the plan, and adding someone by email. */
export function ShareDialog({ planId, shares }: { planId: number; shares: { userId: string; email: string }[] }) {
  const { busy, error, run } = useAction();
  const [email, setEmail] = useState('');
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Share2 data-icon="inline-start" />
        Сподели
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Сподели програмата</DialogTitle>
          <DialogDescription>
            Хората, с които я споделите, могат само да я четат. Ако имейлът има профил, човекът се появява в списъка долу и вижда програмата в „Споделени с мен“.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(`/api/plans/${planId}/shares`, json('POST', { email }), () => setEmail(''));
          }}
        >
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="имейл на колега" aria-label="Имейл" />
          <Button type="submit" disabled={busy}>
            Сподели
          </Button>
        </form>
        <Problem text={error} />
        {shares.length === 0 ? (
          <p className="text-sm text-muted-foreground">Още не е споделена с никого.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {shares.map((s) => (
              <li key={s.userId} className="flex items-center justify-between px-3 py-1.5">
                {s.email}
                <RemoveButton url={`/api/plans/${planId}/shares/${encodeURIComponent(s.userId)}`} label={`Спри споделянето с ${s.email}`} />
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Deletes the plan after asking, then goes back to the list. */
export function DeletePlanButton({ planId }: { planId: number }) {
  const router = useRouter();
  const { busy, error, run } = useAction();
  return (
    <span className="inline-flex items-center gap-2">
      <Problem text={error} />
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        className="text-muted-foreground hover:text-destructive"
        onClick={() => {
          if (confirm('Да изтрия ли програмата? Това не може да се върне.')) run(`/api/plans/${planId}`, { method: 'DELETE' }, () => router.push('/plans'));
        }}
      >
        <Trash2 data-icon="inline-start" />
        Изтрий
      </Button>
    </span>
  );
}
