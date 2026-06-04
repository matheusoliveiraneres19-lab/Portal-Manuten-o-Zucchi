import { CalendarDays, ChevronDown, Search } from "lucide-react";
import { AlertsButton } from "@/components/AlertsButton";
import { AuthUserSummary } from "@/components/AuthUserSummary";
import { LogoutButton } from "@/components/LogoutButton";

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-gold/20 bg-[#070808]/95 px-4 py-3 text-white shadow-[0_8px_24px_rgba(0,0,0,0.24)] backdrop-blur sm:px-6 lg:px-7">
      <div className="mx-auto flex max-w-[1780px] flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-xl text-gold sm:text-2xl">
              Portal de Gestão da Manutenção Zucchi
            </h1>
            <span className="rounded-md border border-gold/50 bg-gradient-to-r from-danger to-[#4a1518] px-3 py-1 text-xs font-bold tracking-wider text-champagne shadow">
              FASE 1
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
          <label className="relative hidden min-w-[260px] max-w-sm flex-1 md:block">
            <Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-champagne" />
            <input
              className="h-11 w-full rounded-lg border border-gold/20 bg-black/45 px-4 pr-10 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-gold/60"
              placeholder="Buscar..."
            />
          </label>
          <button className="hidden h-11 items-center gap-2 rounded-lg border border-gold/20 bg-black/45 px-4 text-sm text-champagne xl:flex">
            <span className="text-[11px] text-zinc-400">Período</span>
            <strong className="font-semibold text-white">01/05/2024 - 31/05/2024</strong>
            <CalendarDays className="h-4 w-4" />
            <ChevronDown className="h-4 w-4" />
          </button>
          <AlertsButton />
          <AuthUserSummary />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
