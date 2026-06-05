"use client";

import { FormEvent, useState } from "react";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createTemporarySession } from "@/lib/auth.client";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/types/auth";

type LoginResponse = { ok: true; user: AuthUser } | { ok: false; message: string };

type Status = "idle" | "loading" | "success";
type ErrorField = "login" | "password" | "both" | null;

const INVALID_MESSAGE = "Login ou senha inválidos. Verifique suas credenciais e tente novamente.";

export function LoginForm() {
  const router = useRouter();
  const controls = useAnimationControls();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<ErrorField>(null);
  const [status, setStatus] = useState<Status>("idle");

  const isBusy = status !== "idle";

  function shake() {
    controls.start({ x: [0, -9, 8, -7, 5, 0], transition: { duration: 0.42, ease: "easeInOut" } });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const login = String(formData.get("login") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!login) {
      setError("Informe seu login.");
      setErrorField("login");
      shake();
      return;
    }
    if (!password) {
      setError("Informe sua senha.");
      setErrorField("password");
      shake();
      return;
    }

    setError("");
    setErrorField(null);
    setStatus("loading");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password })
      });
      const result = (await response.json()) as LoginResponse;

      if (!result.ok) {
        setError(result.message);
        setErrorField("both");
        setStatus("idle");
        shake();
        toast.error(result.message);
        return;
      }

      createTemporarySession(result.user);
      setStatus("success");
      toast.success("Acesso autorizado", { description: `Bem-vindo, ${result.user.name}.` });

      window.setTimeout(() => {
        router.replace("/");
        router.refresh();
      }, 850);
    } catch {
      setError(INVALID_MESSAGE);
      setErrorField("both");
      setStatus("idle");
      shake();
      toast.error(INVALID_MESSAGE);
    }
  }

  const loginInvalid = errorField === "login" || errorField === "both";
  const passwordInvalid = errorField === "password" || errorField === "both";

  return (
    <>
      <motion.form
        noValidate
        animate={controls}
        className="mx-auto mt-8 w-full max-w-[410px] space-y-3 sm:mt-9"
        onSubmit={handleSubmit}
      >
        <label
          className={cn(
            "group flex h-[3.35rem] items-center rounded-lg border bg-black/38 text-zinc-200 transition duration-200 focus-within:bg-black/54 focus-within:shadow-[0_0_0_3px_rgba(196,154,69,0.1),0_0_26px_rgba(196,154,69,0.08)]",
            loginInvalid ? "border-danger/70 shadow-[0_0_0_3px_rgba(181,31,50,0.12)]" : "border-white/14 focus-within:border-gold/78"
          )}
        >
          <span className="sr-only">Login</span>
          <span className="grid h-full w-[3.35rem] shrink-0 place-items-center border-r border-white/10 text-gold transition group-focus-within:border-gold/32">
            <UserRound className="h-5 w-5" strokeWidth={1.65} />
          </span>
          <input
            aria-describedby={error ? "login-error" : undefined}
            aria-invalid={loginInvalid}
            disabled={isBusy}
            className="h-full min-w-0 flex-1 bg-transparent px-4 text-[0.95rem] text-white outline-none placeholder:text-zinc-500 disabled:opacity-70"
            name="login"
            placeholder="Login"
            type="text"
            onChange={() => errorField && setErrorField(null)}
          />
        </label>

        <label
          className={cn(
            "group flex h-[3.35rem] items-center rounded-lg border bg-black/38 text-zinc-200 transition duration-200 focus-within:bg-black/54 focus-within:shadow-[0_0_0_3px_rgba(196,154,69,0.1),0_0_26px_rgba(196,154,69,0.08)]",
            passwordInvalid ? "border-danger/70 shadow-[0_0_0_3px_rgba(181,31,50,0.12)]" : "border-white/14 focus-within:border-gold/78"
          )}
        >
          <span className="sr-only">Senha</span>
          <span className="grid h-full w-[3.35rem] shrink-0 place-items-center border-r border-white/10 text-gold transition group-focus-within:border-gold/32">
            <LockKeyhole className="h-5 w-5" strokeWidth={1.65} />
          </span>
          <input
            aria-describedby={error ? "login-error" : undefined}
            aria-invalid={passwordInvalid}
            disabled={isBusy}
            className="h-full min-w-0 flex-1 bg-transparent px-4 text-[0.95rem] text-white outline-none placeholder:text-zinc-500 disabled:opacity-70"
            name="password"
            placeholder="Senha"
            type={showPassword ? "text" : "password"}
            onChange={() => errorField && setErrorField(null)}
          />
          <button
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            className="grid h-full w-12 shrink-0 place-items-center overflow-hidden text-zinc-400 transition hover:text-gold"
            onClick={() => setShowPassword((value) => !value)}
            type="button"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={showPassword ? "off" : "on"}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.15 }}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" strokeWidth={1.65} />
                ) : (
                  <Eye className="h-5 w-5" strokeWidth={1.65} />
                )}
              </motion.span>
            </AnimatePresence>
          </button>
        </label>

        <AnimatePresence>
          {error ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div
                className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm leading-relaxed text-rose-100/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                id="login-error"
                role="status"
              >
                {error}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <button
          className="group relative mt-4 flex h-[3.55rem] w-full items-center justify-center overflow-hidden rounded-lg border border-[#f4d58d]/58 bg-[linear-gradient(180deg,#f5d48a_0%,#d49c45_48%,#b77b2c_100%)] px-14 text-base font-bold text-[#11100d] shadow-[0_14px_36px_rgba(196,154,69,0.17),inset_0_1px_0_rgba(255,255,255,0.45)] transition duration-200 hover:brightness-110 hover:shadow-[0_18px_48px_rgba(196,154,69,0.27),inset_0_1px_0_rgba(255,255,255,0.52)] disabled:cursor-wait disabled:opacity-90"
          disabled={isBusy}
          type="submit"
        >
          {/* Brilho que percorre o botão durante o loading */}
          {status === "loading" ? (
            <motion.span
              aria-hidden
              className="absolute inset-y-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.45),transparent)]"
              initial={{ x: "-150%" }}
              animate={{ x: "350%" }}
              transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
            />
          ) : null}
          <span className="relative">
            {status === "loading" ? "Validando acesso..." : status === "success" ? "Acesso autorizado" : "Entrar"}
          </span>
          <span className="absolute right-5 grid h-8 w-8 place-items-center">
            {status === "loading" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : status === "success" ? (
              <ShieldCheck className="h-5 w-5" />
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
      </motion.form>

      {/* Transição premium login -> portal */}
      <AnimatePresence>
        {status === "success" ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[80] grid place-items-center bg-[#040404]"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(196,154,69,0.18),transparent_30rem)]" />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="relative flex flex-col items-center gap-4 text-center"
            >
              <span className="grid h-16 w-16 place-items-center rounded-full border border-gold/40 bg-black/40 text-gold shadow-[0_0_40px_rgba(196,154,69,0.25)]">
                <Loader2 className="h-7 w-7 animate-spin" strokeWidth={1.6} />
              </span>
              <p className="font-serif text-2xl text-gold">Preparando seu ambiente de manutenção...</p>
              <p className="text-sm text-zinc-400">Zucchi Stones Luxury</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
