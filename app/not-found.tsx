import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="mx-auto grid max-w-md gap-4 px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Страницата не е намерена</h1>
      <p className="text-sm text-muted-foreground">Адресът е грешен или програмата е изтрита.</p>
      <Link href="/plans" className={buttonVariants({ variant: 'outline' }) + ' justify-self-center'}>
        Към моите програми
      </Link>
    </main>
  );
}
