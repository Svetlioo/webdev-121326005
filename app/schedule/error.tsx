'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export default function ScheduleError({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <Alert variant="destructive">
        <AlertTitle>Разписанието не може да се зареди</AlertTitle>
        <AlertDescription>Проверете връзката и опитайте отново.</AlertDescription>
      </Alert>
      <Button variant="outline" className="mt-4" onClick={() => retry()}>
        Опитай отново
      </Button>
    </main>
  );
}
