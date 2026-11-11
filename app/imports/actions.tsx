'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const FAILED = 'Нещо се обърка. Опитайте отново.';

/** Sends a request and refreshes the page, or shows the server's refusal. */
function useAction() {
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

export function ImportForm() {
  const { busy, error, run } = useAction();
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        run('/api/imports', { method: 'POST', body: new FormData(form) }, () => form.reset());
      }}
    >
      <label className="grid gap-1 text-sm">
        Адрес на страницата с разписанието
        <Input name="url" type="url" placeholder="https://cs.fcst.bg/page.php?id=89" />
      </label>
      <label className="grid gap-1 text-sm">
        или снимка (PNG, JPEG, WebP)
        <Input name="photo" type="file" accept="image/png,image/jpeg,image/webp" />
      </label>
      <label className="grid gap-1 text-sm">
        Указания към модела (по желание)
        <Input name="instructions" placeholder="напр. упражненията по ПИ започват от 2. седмица" />
      </label>
      <Error text={error} />
      <Button type="submit" disabled={busy} className="justify-self-start">
        Внеси
      </Button>
    </form>
  );
}

/** Reloads the page every few seconds while an import is queued or processing. */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [router]);
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
