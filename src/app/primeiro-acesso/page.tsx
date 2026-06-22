import type { Metadata } from "next";
import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/login/brand";
import { FirstAccessForm } from "@/components/first-access/FirstAccessForm";
import { AUTH_COOKIE_NAME, getAuthSecret } from "@/lib/auth";
import { verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Primeiro acesso — Portal de Gestão da Manutenção Zucchi",
  description: "Criação de nova senha no primeiro acesso ao portal."
};

export default async function Page() {
  // Guard: só sessão de PRIMEIRO ACESSO (mustChange) entra aqui.
  const secret = getAuthSecret();
  const token = secret ? cookies().get(AUTH_COOKIE_NAME)?.value : undefined;
  const session = secret ? await verifySession(token, secret) : null;

  if (!session) {
    redirect("/login");
  }
  if (!session.mustChange) {
    // Sessão normal (já trocou a senha) — não há o que fazer aqui.
    redirect("/");
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#030404] text-white">
      <div className="relative min-h-screen">
        <Image
          src="/images/login-background.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.72)_0%,rgba(0,0,0,0.62)_34%,rgba(0,0,0,0.38)_62%,rgba(0,0,0,0.18)_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(196,154,69,0.14),transparent_26rem),linear-gradient(180deg,rgba(0,0,0,0.16),rgba(0,0,0,0.5))]" />
        <div className="relative grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(460px,48%)_minmax(0,52%)]">
          <section className="flex min-h-screen items-center justify-center px-4 py-6 sm:px-6 lg:px-8 xl:px-10">
            <section className="login-card-surface relative flex w-full max-w-[610px] flex-col overflow-hidden rounded-[1.15rem] border border-gold/38 shadow-[0_24px_80px_rgba(0,0,0,0.52)] backdrop-blur-xl">
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

                  <h1 className="mt-8 max-w-[380px] font-serif text-[2rem] leading-[1.13] text-zinc-100 sm:text-[2.4rem]">
                    Crie sua nova <span className="text-gold">senha</span>
                  </h1>
                  <p className="mt-4 text-sm leading-relaxed text-champagne/70 sm:text-[0.95rem]">
                    Por segurança, altere sua senha temporária antes de acessar o Portal de Gestão da Manutenção
                    Zucchi.
                  </p>
                </div>

                <FirstAccessForm />
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
          </section>

          <section aria-hidden="true" className="hidden min-h-screen lg:block" />
        </div>
      </div>
    </main>
  );
}
