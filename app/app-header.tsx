import Link from 'next/link';
import type { Actor } from '@/src/auth';
import { canPublish } from '@/src/services/errors';
import { SignOutButton } from './schedule/buttons';
import { LinkGoogleButton } from './week/link-google';

type Page = 'plans' | 'week' | 'schedule' | 'imports' | 'users';

/** The same menu on every page; links a role may not use are not shown (the services refuse them anyway). */
export function AppHeader({ actor, current }: { actor: Actor; current: Page }) {
  const links: [Page, string, string][] = [
    ['plans', '/plans', 'Моите програми'],
    ['week', '/week', 'Седмица'],
    ['schedule', '/schedule', 'Цялото разписание'],
  ];
  if (canPublish(actor)) links.push(['imports', '/imports', 'Внасяне']);
  if (actor.role === 'admin') links.push(['users', '/admin/users', 'Потребители']);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
        <nav aria-label="Главно меню" className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
          <Link href="/plans" className="mr-3 font-semibold">
            ТУ <span className="text-muted-foreground">Програма</span>
          </Link>
          {links.map(([page, href, label]) => (
            <Link
              key={page}
              href={href}
              aria-current={page === current ? 'page' : undefined}
              className="rounded-md px-2.5 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground"
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <LinkGoogleButton />
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
