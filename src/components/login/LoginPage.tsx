import Image from "next/image";
import { LoginCard } from "@/components/login/LoginCard";

export function LoginPage() {
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
            <LoginCard />
          </section>

          <section aria-hidden="true" className="hidden min-h-screen lg:block" />
        </div>
      </div>
    </main>
  );
}
