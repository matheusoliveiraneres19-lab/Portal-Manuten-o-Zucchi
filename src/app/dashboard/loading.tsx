/**
 * Skeleton do segmento /dashboard. As proporções acompanham DashboardHome
 * (4 KPIs + linha de 5/3/4 + linha de 7/5) para que a troca skeleton → conteúdo
 * não desloque o layout.
 */
function SkeletonPanel({ className = "" }: { className?: string }) {
  return (
    <div className={`panel p-4 ${className}`}>
      <div className="h-3 w-36 animate-pulse rounded bg-neutralized/25" />
      <div className="mt-4 h-[200px] animate-pulse rounded-lg bg-neutralized/15 sm:h-[224px] xl:h-[248px] 2xl:h-[288px]" />
    </div>
  );
}

export default function DashboardSegmentLoading() {
  return (
    <div>
      {/* Cabeçalho da página */}
      <div className="panel p-5">
        <div className="h-3 w-40 animate-pulse rounded bg-neutralized/25" />
        <div className="mt-3 h-7 w-72 animate-pulse rounded bg-neutralized/20" />
        <div className="mt-3 h-3 w-full max-w-xl animate-pulse rounded bg-neutralized/15" />
      </div>

      {/* KPIs */}
      <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="panel flex min-h-[118px] items-center gap-4 p-4 pl-5">
            <div className="h-16 w-16 animate-pulse rounded-full bg-neutralized/25" />
            <div className="flex-1">
              <div className="h-3 w-24 animate-pulse rounded bg-neutralized/25" />
              <div className="mt-3 h-8 w-20 animate-pulse rounded bg-neutralized/20" />
              <div className="mt-2.5 h-3 w-28 animate-pulse rounded bg-neutralized/15" />
            </div>
          </div>
        ))}
      </section>

      {/* Gráficos e rankings */}
      <section className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
        <SkeletonPanel className="xl:col-span-5" />
        <SkeletonPanel className="xl:col-span-3" />
        <SkeletonPanel className="xl:col-span-4" />
      </section>

      <section className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
        <SkeletonPanel className="xl:col-span-7" />
        <SkeletonPanel className="xl:col-span-5" />
      </section>
    </div>
  );
}
