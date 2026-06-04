"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { createTemporarySession } from "@/lib/auth.client";
import type { AuthUser } from "@/types/auth";

type LoginResponse =
  | {
      ok: true;
      user: AuthUser;
    }
  | {
      ok: false;
      message: string;
    };

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const login = String(formData.get("login") ?? "");
    const password = String(formData.get("password") ?? "");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ login, password })
      });
      const result = (await response.json()) as LoginResponse;

      if (!result.ok) {
        setError(result.message);
        setIsLoading(false);
        return;
      }

      createTemporarySession(result.user);
      router.replace("/");
      router.refresh();
    } catch {
      setError("Login ou senha inválidos. Verifique suas credenciais e tente novamente.");
      setIsLoading(false);
    }
  }

  return (
    <form className="mx-auto mt-8 w-full max-w-[410px] space-y-3 sm:mt-9" onSubmit={handleSubmit}>
      <label className="group flex h-[3.35rem] items-center rounded-lg border border-white/14 bg-black/38 text-zinc-200 transition duration-200 focus-within:border-gold/78 focus-within:bg-black/54 focus-within:shadow-[0_0_0_3px_rgba(196,154,69,0.1),0_0_26px_rgba(196,154,69,0.08)]">
        <span className="sr-only">Login</span>
        <span className="grid h-full w-[3.35rem] shrink-0 place-items-center border-r border-white/10 text-gold transition group-focus-within:border-gold/32">
          <UserRound className="h-5 w-5" strokeWidth={1.65} />
        </span>
        <input
          aria-describedby={error ? "login-error" : undefined}
          aria-invalid={Boolean(error)}
          className="h-full min-w-0 flex-1 bg-transparent px-4 text-[0.95rem] text-white outline-none placeholder:text-zinc-500"
          name="login"
          placeholder="Login"
          required
          type="text"
        />
      </label>

      <label className="group flex h-[3.35rem] items-center rounded-lg border border-white/14 bg-black/38 text-zinc-200 transition duration-200 focus-within:border-gold/78 focus-within:bg-black/54 focus-within:shadow-[0_0_0_3px_rgba(196,154,69,0.1),0_0_26px_rgba(196,154,69,0.08)]">
        <span className="sr-only">Senha</span>
        <span className="grid h-full w-[3.35rem] shrink-0 place-items-center border-r border-white/10 text-gold transition group-focus-within:border-gold/32">
          <LockKeyhole className="h-5 w-5" strokeWidth={1.65} />
        </span>
        <input
          aria-describedby={error ? "login-error" : undefined}
          aria-invalid={Boolean(error)}
          className="h-full min-w-0 flex-1 bg-transparent px-4 text-[0.95rem] text-white outline-none placeholder:text-zinc-500"
          name="password"
          placeholder="Senha"
          required
          type={showPassword ? "text" : "password"}
        />
        <button
          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
          className="grid h-full w-12 shrink-0 place-items-center text-zinc-400 transition hover:text-gold"
          onClick={() => setShowPassword((value) => !value)}
          type="button"
        >
          {showPassword ? (
            <EyeOff className="h-5 w-5" strokeWidth={1.65} />
          ) : (
            <Eye className="h-5 w-5" strokeWidth={1.65} />
          )}
        </button>
      </label>

      {error ? (
        <div
          className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm leading-relaxed text-rose-100/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          id="login-error"
          role="status"
        >
          {error}
        </div>
      ) : null}

      <button
        className="group relative mt-4 flex h-[3.55rem] w-full items-center justify-center rounded-lg border border-[#f4d58d]/58 bg-[linear-gradient(180deg,#f5d48a_0%,#d49c45_48%,#b77b2c_100%)] px-14 text-base font-bold text-[#11100d] shadow-[0_14px_36px_rgba(196,154,69,0.17),inset_0_1px_0_rgba(255,255,255,0.45)] transition duration-200 hover:brightness-110 hover:shadow-[0_18px_48px_rgba(196,154,69,0.27),inset_0_1px_0_rgba(255,255,255,0.52)] disabled:cursor-wait disabled:opacity-85"
        disabled={isLoading}
        type="submit"
      >
        <span>{isLoading ? "Validando..." : "Entrar"}</span>
        <span className="absolute right-5 grid h-8 w-8 place-items-center">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
          )}
        </span>
      </button>

      <div className="pt-5">
        <div className="mb-5 flex items-center gap-4">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-gold/35" />
          <LockKeyhole className="h-4 w-4 text-gold" strokeWidth={1.65} />
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-gold/35" />
        </div>
        <a className="mx-auto flex w-fit items-center gap-2 text-sm font-medium text-gold/90 transition hover:text-champagne" href="#">
          <span>Esqueceu a senha?</span>
        </a>
      </div>
    </form>
  );
}
