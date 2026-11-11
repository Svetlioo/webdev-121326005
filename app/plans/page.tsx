import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/app/app-header';
import { getActor } from '@/app/session';
import { Badge } from '@/components/ui/badge';
import type { Plan } from '@/src/data/plans';
import { listMyPlans } from '@/src/services/plans';
import { listClasses } from '@/src/services/schedule';
import { CreatePlanForm } from './plan-actions';

export default async function PlansPage() {
  const actor = await getActor();
  if (!actor) redirect('/signin');
  const { own, shared } = await listMyPlans(actor);
  const groups = [...new Set((await listClasses(actor)).flatMap((c) => c.groups.map((g) => g.name)))].sort();

  return (
    <div className="min-h-dvh bg-muted/40">
      <AppHeader actor={actor} current="plans" />
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Моите програми</h1>
          <p className="text-sm text-muted-foreground">
            Програмата е вашата седмица: добавяте работата и срещите си, а всяко занятие получава съвет дали можете да присъствате.
          </p>
        </div>

        <section aria-labelledby="new-title" className="rounded-lg border bg-background p-4">
          <h2 id="new-title" className="mb-3 text-sm font-medium">
            Нова програма
          </h2>
          <CreatePlanForm groups={groups} />
        </section>

        <PlanList title="Мои" plans={own} empty="Още нямате програма. Създайте първата отгоре." />
        <PlanList title="Споделени с мен" plans={shared} empty="Никой още не е споделил програма с вас." shared />
      </main>
    </div>
  );
}

function PlanList({ title, plans, empty, shared }: { title: string; plans: Plan[]; empty: string; shared?: boolean }) {
  return (
    <section aria-label={title} className="grid gap-3">
      <h2 className="text-sm font-medium">{title}</h2>
      {plans.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <li key={p.id}>
              <Link href={`/plans/${p.id}`} className="grid gap-2 rounded-lg border bg-background p-4 transition-colors hover:border-foreground/30">
                <span className="font-medium">{p.name}</span>
                <span className="flex flex-wrap gap-1">
                  <Badge variant="secondary">група {p.groupName}</Badge>
                  {shared && <Badge variant="outline">само за четене · {p.ownerEmail}</Badge>}
                  {p.modelStatus === 'queued' || p.modelStatus === 'processing' ? <Badge variant="outline">моделът чете…</Badge> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
