'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

// Shown when the page cannot be built, for example when the database is down.
export default function PageError({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <Alert variant="destructive">
        <AlertTitle>Седмицата не може да се зареди</AlertTitle>
        <AlertDescription>Сървърът или базата данни не отговарят. Опитайте отново след малко.</AlertDescription>
      </Alert>
      <Button variant="outline" className="mt-4" onClick={() => retry()}>
        Опитай отново
      </Button>
    </main>
  );
}
