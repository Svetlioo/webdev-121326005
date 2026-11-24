'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { buttonVariants } from '@/components/ui/button';

const KEY = 'plan-week-scroll';

/** ‹ previous and next › week. The page keeps its scroll position: while the next week loads the
 *  skeleton is shorter than the page, so the position is saved on click and restored when it arrives. */
export function WeekNav({ planId, week, last }: { planId: number; week: number; last: number }) {
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(KEY);
      sessionStorage.removeItem(KEY);
    } catch {}
    if (!saved) return;
    // The calendar is drawn just after the page, so the page grows for a moment: restore a few times.
    const top = Number(saved);
    const timers = [0, 60, 150, 300, 500].map((ms) => setTimeout(() => window.scrollTo({ top, behavior: 'instant' }), ms));
    return () => timers.forEach(clearTimeout);
  }, [week]);

  const remember = () => {
    try {
      sessionStorage.setItem(KEY, String(window.scrollY));
    } catch {}
  };
  const link = (w: number, label: string) => (
    <Link href={`/plans/${planId}?week=${w}`} scroll={false} onClick={remember} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
      {label}
    </Link>
  );

  return (
    <nav aria-label="Седмици" className="flex gap-1">
      {week > 1 && link(week - 1, `‹ ${week - 1}.`)}
      {week < last && link(week + 1, `${week + 1}. ›`)}
    </nav>
  );
}
