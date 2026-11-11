import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { getActor } from '@/app/session';
import { listImports } from '@/src/services/imports';
import { ActionButton, AutoRefresh, ImportForm } from './actions';

export const STATUS = {
  queued: 'в опашката',
  processing: 'моделът чете',
  ready: 'готово за преглед',
  failed: 'неуспешно',
  published: 'публикувано',
};

export default async function ImportsPage() {
  const actor = await getActor();
  if (!actor) redirect('/signin');
  if (actor.role !== 'publisher') {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Alert variant="destructive">
          <AlertDescription>Само публикуващ може да внася разписания.</AlertDescription>
        </Alert>
      </main>
    );
  }
  const imports = await listImports(actor);
  const waiting = imports.some((i) => i.status === 'queued' || i.status === 'processing');

  return (
    <div className="min-h-dvh bg-muted/40">
      {waiting && <AutoRefresh />}
      <header className="border-b bg-background">
        <nav className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 text-sm">
          <Link href="/week" className="text-muted-foreground hover:text-foreground">
            Седмица
          </Link>
          <span className="font-medium">Внасяне</span>
        </nav>
      </header>
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Внасяне на разписание</h1>
        <section className="rounded-lg border bg-background p-4">
          <ImportForm />
        </section>
        <section aria-labelledby="list-title" className="rounded-lg border bg-background">
          <h2 id="list-title" className="border-b px-4 py-3 text-sm font-medium">
            Последни внасяния
          </h2>
          {imports.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Още няма внасяния.</p>
          ) : (
            <ul className="divide-y">
              {imports.map((i) => (
                <li key={i.id} className="grid gap-1 px-4 py-3 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">№ {i.id}</span>
                    <Badge variant={i.status === 'failed' ? 'destructive' : 'secondary'}>{STATUS[i.status]}</Badge>
                    <span className="min-w-0 truncate text-muted-foreground">{i.sourceUrl ?? 'снимка'}</span>
                  </p>
                  {i.error && <p className="text-destructive">{i.error}</p>}
                  <div className="flex gap-2">
                    {i.status === 'ready' && (
                      <Link href={`/imports/${i.id}`} className="text-sm underline underline-offset-4">
                        Прегледай
                      </Link>
                    )}
                    {i.status === 'failed' && (
                      <ActionButton url={`/api/imports/${i.id}/retry`} method="POST" label="Опитай отново" variant="outline" />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
