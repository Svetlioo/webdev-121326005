export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8" role="status" aria-label="Зареждане на разписанието">
      <div className="mb-6 h-8 w-64 animate-pulse rounded bg-muted" />
      <div className="grid gap-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-lg border bg-muted/50" />
        ))}
      </div>
    </div>
  );
}
