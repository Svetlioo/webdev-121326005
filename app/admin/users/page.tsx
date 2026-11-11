import { redirect } from 'next/navigation';
import { AppHeader } from '@/app/app-header';
import { getActor } from '@/app/session';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { listUsers } from '@/src/services/users';
import { RoleSelect } from './role-select';

export default async function UsersPage() {
  const actor = await getActor();
  if (!actor) redirect('/signin');
  if (actor.role !== 'admin') {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Alert variant="destructive">
          <AlertDescription>Само администратор може да променя роли.</AlertDescription>
        </Alert>
      </main>
    );
  }
  const users = await listUsers(actor);
  return (
    <div className="min-h-dvh bg-muted/40">
      <AppHeader actor={actor} current="users" />
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Потребители</h1>
          <p className="text-sm text-muted-foreground">Публикуващият внася разписанието за всички; администраторът дава роли.</p>
        </div>
        <ul className="divide-y rounded-lg border bg-background">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="min-w-0 truncate">{u.email}</span>
              <RoleSelect userId={u.id} role={u.role} email={u.email} disabled={u.id === actor.id} />
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
