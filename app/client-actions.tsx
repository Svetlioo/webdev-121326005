'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const FAILED = 'Нещо се обърка. Опитайте отново.';

/** Sends a request and refreshes the page, or shows the server's refusal. */
export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(url: string, init: RequestInit, after?: (body: any) => void) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(url, init);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return setError(body.error ?? FAILED);
      after?.(body);
      router.refresh();
    } catch {
      setError(FAILED);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

const Error = ({ text }: { text: string }) =>
  text ? (
    <p role="alert" className="text-sm text-destructive">
      {text}
    </p>
  ) : null;

/** Imports a timetable into a plan: a page address or a photo, read by the model in the worker. */
export function ImportForm({ planId }: { planId: number }) {
  const { busy, error, run } = useAction();
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        run(`/api/plans/${planId}/imports`, { method: 'POST', body: new FormData(form) }, () => form.reset());
      }}
    >
      <label className="grid gap-1 text-sm">
        Адрес на страницата с разписанието
        <Input name="url" type="url" placeholder="https://cs.fcst.bg/page.php?id=89" />
      </label>
      <label className="grid gap-1 text-sm">
        и/или снимка на разписанието (PNG, JPEG, WebP)
        <Input name="photo" type="file" accept="image/png,image/jpeg,image/webp" />
      </label>
      <label className="grid gap-1 text-sm">
        Указания към модела (по желание)
        <Input name="instructions" placeholder="напр. упражненията по ПИ започват от 2. седмица" />
      </label>
      <p className="text-xs text-muted-foreground">
        Чете го локалният модел на лаптопа; когато той е изключен или зает, го чете Gemini на Google и линкът, снимката и указанията се изпращат към Google.
      </p>
      <Error text={error} />
      <Button type="submit" disabled={busy} className="justify-self-start">
        Внеси разписанието
      </Button>
    </form>
  );
}

/** Reloads the page every few seconds while something waits for the worker, for two minutes at most:
 *  with no worker running (as on Render) the page must not poll forever. */
export function AutoRefresh({ forMs = 120_000 }: { forMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 3000);
    const stop = setTimeout(() => clearInterval(timer), forMs);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [router, forMs]);
  return null;
}

export function ActionButton(props: { url: string; method: string; label: string; disabled?: boolean; variant?: 'outline' | 'ghost' }) {
  const { busy, error, run } = useAction();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant={props.variant}
        disabled={busy || props.disabled}
        onClick={() => run(props.url, { method: props.method })}
      >
        {props.label}
      </Button>
      <Error text={error} />
    </span>
  );
}
