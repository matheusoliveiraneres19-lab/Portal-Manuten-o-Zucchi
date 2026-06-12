import { LoginForm } from "@/components/login/LoginForm";
import { BrandMark } from "@/components/login/brand";

export function LoginCard() {
  return (
    <section className="login-card-surface relative flex min-h-[min(860px,calc(100vh-40px))] w-full max-w-[610px] flex-col overflow-hidden rounded-[1.15rem] border border-gold/38 shadow-[0_24px_80px_rgba(0,0,0,0.52)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-[1px] rounded-[1.08rem] border border-white/[0.045]" />

      <div className="relative flex flex-1 flex-col px-6 pb-8 pt-9 sm:px-10 sm:pt-10 xl:px-12">
        <div className="mx-auto flex w-full max-w-[410px] flex-col items-center text-center">
          <BrandMark size="large" />

          <div className="mt-6 flex w-full items-center gap-4 text-gold/60">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/45 to-gold/20" />
            <span className="grid h-4 w-4 rotate-45 place-items-center border border-gold/55 bg-black/30">
              <span className="h-1 w-1 rounded-full bg-gold/85" />
            </span>
            <span className="h-px flex-1 bg-gradient-to-l from-transparent via-gold/45 to-gold/20" />
          </div>

          <h1 className="mt-8 max-w-[370px] font-serif text-[2rem] leading-[1.13] text-zinc-100 sm:text-[2.55rem]">
            Portal de Gestão da Manutenção <span className="text-gold">Zucchi</span>
          </h1>
          <p className="mt-4 text-sm text-champagne/70 sm:text-base">Acesse sua conta</p>
        </div>

        <LoginForm />
      </div>

      <footer className="relative border-t border-gold/26 bg-black/36 px-6 py-7 text-center">
        <div className="mx-auto mb-5 grid h-11 w-11 rotate-45 place-items-center border border-gold/60 bg-black/45 shadow-[0_0_24px_rgba(196,154,69,0.13)]">
          <span className="-rotate-45 font-serif text-[1.55rem] italic leading-none text-gold">Z</span>
        </div>
        <p className="text-[0.66rem] font-semibold uppercase tracking-[0.42em] text-gold/85">
          Zucchi Luxury Stones
        </p>
        <p className="mt-2 text-sm text-champagne/68">Excelência que transforma</p>
      </footer>
    </section>
  );
}
