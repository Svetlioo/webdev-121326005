'use client';

import { LogOut, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/src/auth-client';

export function DeleteButton({ id, label }: { id: number; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onClick() {
    setBusy(true);
    setError('');
    const response = await fetch(`/api/entries/${id}`, { method: 'DELETE' });
    setBusy(false);
    if (response.ok) return router.refresh();
    const body = await response.json().catch(() => ({}));
    setError(body.error ?? 'Нещо се обърка. Опитайте отново.');
  }

  return (
    <span className="inline-flex items-center gap-2">
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-destructive"
        onClick={onClick}
        disabled={busy}
        aria-label={`Изтрий ${label}`}
        title="Изтрий"
      >
        <Trash2 />
      </Button>
    </span>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await authClient.signOut();
        router.push('/signin');
        router.refresh();
      }}
    >
      <LogOut data-icon="inline-start" />
      Изход
    </Button>
  );
}
