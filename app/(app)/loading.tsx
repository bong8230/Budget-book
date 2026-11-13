export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="불러오는 중">
      <div className="h-6 w-32 animate-pulse rounded-lg bg-surface-2" />
      <div className="h-32 animate-pulse rounded-2xl bg-surface" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-20 animate-pulse rounded-2xl bg-surface" />
        <div className="h-20 animate-pulse rounded-2xl bg-surface" />
      </div>
      <div className="h-48 animate-pulse rounded-2xl bg-surface" />
    </div>
  );
}
