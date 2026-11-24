import Link from 'next/link';
import type { Actor } from '@/src/auth';
import { SignOutButton } from './buttons';
import { isGoogleLinked } from '@/src/services/users';
import { LinkGoogleButton } from './link-google';

type Page = 'plans' | 'users';

/** The same menu on every page; the Users link is only for admins (the service refuses others anyway). */
export async function AppHeader({ actor, current }: { actor: Actor; current: Page }) {
  const googleLinked = await isGoogleLinked(actor);
  const links: [Page, string, string][] = [['plans', '/plans', 'Моите програми']];
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
          {actor.role === 'admin' && <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs">администратор</span>}
        </nav>
        <div className="flex items-center gap-1">
          {!googleLinked && <LinkGoogleButton />}
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
