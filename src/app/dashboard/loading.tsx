function SkeletonPanel({ className = "" }: { className?: string }) {
  return (
    <div className={`panel animate-pulse rounded-lg p-4 ${className}`}>
      <div className="h-3 w-36 rounded bg-zinc-300/70" />
      <div className="mt-5 h-28 rounded bg-zinc-200/80" />
    </div>
  );
}

export default function DashboardSegmentLoading() {
  return (
    <div>
      {/* Cabeçalho da página */}
      <div className="panel animate-pulse rounded-lg p-5">
        <div className="h-3 w-40 rounded bg-zinc-300/70" />
        <div className="mt-3 h-7 w-72 rounded bg-zinc-200/80" />
        <div className="mt-3 h-3 w-full max-w-xl rounded bg-zinc-200/70" />
      </div>

      {/* KPIs */}
      <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="panel flex min-h-[110px] animate-pulse items-center gap-4 rounded-lg p-4">
            <div className="h-14 w-14 rounded-full bg-zinc-300/80" />
            <div className="flex-1">
              <div className="h-3 w-24 rounded bg-zinc-300/80" />
              <div className="mt-3 h-7 w-20 rounded bg-zinc-200/90" />
              <div className="mt-3 h-3 w-28 rounded bg-zinc-200/80" />
            </div>
          </div>
        ))}
      </section>

      {/* Blocos de conteúdo */}
      <section className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
        <SkeletonPanel className="xl:col-span-7" />
        <SkeletonPanel className="xl:col-span-5" />
        <SkeletonPanel className="xl:col-span-8" />
        <SkeletonPanel className="xl:col-span-4" />
      </section>
    </div>
  );
}
