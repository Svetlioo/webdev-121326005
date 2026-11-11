'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** A publisher's note on one class, for this week only or for every week. */
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
        placeholder="Бележка, напр. Отменено"
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
