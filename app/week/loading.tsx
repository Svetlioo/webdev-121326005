export default function Loading() {
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8" role="status" aria-label="Зареждане на седмицата">
      <div className="h-8 w-64 animate-pulse rounded bg-muted" />
      <div className="h-24 animate-pulse rounded-lg border bg-muted/50" />
      <div className="h-96 animate-pulse rounded-lg border bg-muted/50" />
    </div>
  );
}
