export default function Loading() {
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8" role="status" aria-label="Зареждане на потребителите">
      <div className="h-8 w-64 animate-pulse rounded bg-muted" />
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="h-96 animate-pulse rounded-lg border bg-muted/50" />
        <div className="h-96 animate-pulse rounded-lg border bg-muted/50" />
      </div>
    </div>
  );
}
