'use client';

import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { useState } from 'react';
import { useAction } from '@/app/client-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** A note on one class of a plan, for this week only or for every week. */
export function NoteForm({ entryId, week, label }: { entryId: number; week: number; label: string }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [onlyThisWeek, setOnlyThisWeek] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entryId, week: onlyThisWeek ? week : null, text }),
      });
      if (response.ok) {
        setText('');
        return router.refresh();
      }
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? 'Нещо се обърка. Опитайте отново.');
    } catch {
      setError('Нещо се обърка. Опитайте отново.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 flex flex-wrap items-center gap-2">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Бележка, напр. Отменено или Контролно"
        aria-label={`Бележка към ${label}`}
        className="h-7 max-w-56 text-xs"
      />
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        <input type="checkbox" checked={onlyThisWeek} onChange={(e) => setOnlyThisWeek(e.target.checked)} />
        само {week}. седмица
      </label>
      <Button type="submit" size="sm" variant="outline" disabled={busy || !text.trim()}>
        Добави
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </form>
  );
}

const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** One note on a class; whoever may change the plan removes it with × ("Не ходя" removed brings the class back). */
export function NoteBadge({ note, canEdit, destructive }: { note: { id: number; text: string; week: number | null }; canEdit: boolean; destructive: boolean }) {
  const { busy, error, run } = useAction();
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={destructive ? 'destructive' : 'secondary'}>
        {note.text}
        {note.week === null && ' (всяка седмица)'}
        {canEdit && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(`/api/notes/${note.id}`, { method: 'DELETE' })}
            aria-label={`Махни бележката „${note.text}“`}
            className="-mr-1 ml-0.5 rounded-full p-0.5 hover:bg-black/10"
          >
            <X className="size-3" />
          </button>
        )}
      </Badge>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}

/** Skip one class: this week only, or every week. Shown greyed out as "Не ходя"; removing the note brings it back. */
export function SkipButtons({ entryId, week }: { entryId: number; week: number }) {
  const { busy, error, run } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm">Не ходя:</span>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => run('/api/notes', json({ entryId, week, text: 'Не ходя' }))}>
        само {week}. седмица
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => run('/api/notes', json({ entryId, week: null, text: 'Не ходя' }))}>
        всяка седмица
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
