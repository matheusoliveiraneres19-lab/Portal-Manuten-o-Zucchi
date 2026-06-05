import { Header } from "@/components/Header";
import { HeroBanner } from "@/components/HeroBanner";
import { Sidebar } from "@/components/Sidebar";
import { toInputDate } from "@/utils/period";

function SkeletonPanel({ className = "" }: { className?: string }) {
  return (
    <div className={`panel animate-pulse rounded-lg p-4 ${className}`}>
      <div className="h-3 w-36 rounded bg-zinc-300/70" />
      <div className="mt-5 h-32 rounded bg-zinc-200/80" />
    </div>
  );
}

export default function Loading() {
  // Placeholder de período no skeleton (mês corrente). O período real é resolvido
  // pelo layout/página quando o conteúdo carrega.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return (
    <main className="min-h-screen lg:pl-80">
      <Sidebar />
      <Header defaultStartDate={toInputDate(monthStart)} defaultEndDate={toInputDate(monthEnd)} />
      <div className="mx-auto max-w-[1780px] px-4 pb-8 pt-4 sm:px-6 lg:px-7">
        <HeroBanner />

        <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="panel flex min-h-[110px] animate-pulse items-center gap-4 rounded-lg p-4">
              <div className="h-16 w-16 rounded-full bg-zinc-300/80" />
              <div className="flex-1">
                <div className="h-3 w-24 rounded bg-zinc-300/80" />
                <div className="mt-3 h-8 w-20 rounded bg-zinc-200/90" />
                <div className="mt-3 h-3 w-28 rounded bg-zinc-200/90" />
              </div>
            </div>
          ))}
        </section>

        <section className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
          <SkeletonPanel className="xl:col-span-4" />
          <SkeletonPanel className="xl:col-span-3" />
          <SkeletonPanel className="xl:col-span-5" />
          <SkeletonPanel className="xl:col-span-4" />
          <SkeletonPanel className="xl:col-span-4" />
          <SkeletonPanel className="xl:col-span-4" />
        </section>
      </div>
    </main>
  );
}
