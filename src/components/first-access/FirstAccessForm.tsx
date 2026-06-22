"use client";

import { FormEvent, useState } from "react";
import { AnimatePresence, m, useAnimationControls } from "framer-motion";
import { Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { createTemporarySession } from "@/lib/auth.client";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/types/auth";

type Status = "idle" | "loading" | "success";
type ChangeResponse = { ok: true; user: AuthUser; message?: string } | { ok: false; message: string };

/** Regras mínimas (espelham o servidor): 8+ caracteres, 1 letra e 1 número. */
function validate(password: string, confirm: string): string | null {
  if (!password || !confirm) return "Informe e confirme a nova senha.";
  if (password.length < 8) return "A senha deve ter no mínimo 8 caracteres.";
  if (!/[A-Za-z]/.test(password)) return "A senha deve conter pelo menos 1 letra.";
  if (!/\d/.test(password)) return "A senha deve conter pelo menos 1 número.";
  if (password !== confirm) return "As senhas não conferem.";
  return null;
}

export function FirstAccessForm() {
  const controls = useAnimationControls();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const isBusy = status !== "idle";

  function shake() {
    controls.start({ x: [0, -9, 8, -7, 5, 0], transition: { duration: 0.42, ease: "easeInOut" } });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy) return;

    const validationError = validate(password, confirmPassword);
    if (validationError) {
      setError(validationError);
      shake();
      return;
    }

    setError("");
    setStatus("loading");

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmPassword })
      });
      const result = (await response.json()) as ChangeResponse;

      if (!result.ok) {
        setError(result.message);
        setStatus("idle");
        shake();
        toast.error(result.message);
        return;
      }

      createTemporarySession(result.user);
      setStatus("success");
      toast.success("Senha alterada com sucesso.");
      // Sessão normal já emitida pelo endpoint — full load entra no portal.
      window.setTimeout(() => window.location.assign("/"), 850);
    } catch {
      setError("Não foi possível alterar a senha. Tente novamente.");
      setStatus("idle");
      shake();
    }
  }

  return (
    <>
      <m.form
        noValidate
        animate={controls}
        className="mx-auto mt-8 w-full max-w-[410px] space-y-3"
        onSubmit={handleSubmit}
      >
        <PasswordField
          name="password"
          placeholder="Nova senha"
          value={password}
          show={show}
          disabled={isBusy}
          onToggle={() => setShow((v) => !v)}
          onChange={(value) => {
            setPassword(value);
            if (error) setError("");
          }}
        />
        <PasswordField
          name="confirmPassword"
          placeholder="Confirmar nova senha"
          value={confirmPassword}
          show={show}
          disabled={isBusy}
          onToggle={() => setShow((v) => !v)}
          onChange={(value) => {
            setConfirmPassword(value);
            if (error) setError("");
          }}
        />

        <p className="px-1 text-[0.7rem] leading-relaxed text-champagne/55">
          Mínimo de 8 caracteres, com pelo menos 1 letra e 1 número. Diferente da senha temporária.
        </p>

        <AnimatePresence>
          {error ? (
            <m.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div
                className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm leading-relaxed text-rose-100/95"
                role="status"
              >
                {error}
              </div>
            </m.div>
          ) : null}
        </AnimatePresence>

        <button
          className="group relative mt-4 flex h-[3.55rem] w-full items-center justify-center overflow-hidden rounded-lg border border-[#f4d58d]/58 bg-[linear-gradient(180deg,#f5d48a_0%,#d49c45_48%,#b77b2c_100%)] px-14 text-base font-bold text-[#11100d] shadow-[0_14px_36px_rgba(196,154,69,0.17),inset_0_1px_0_rgba(255,255,255,0.45)] transition duration-200 hover:brightness-110 disabled:cursor-wait disabled:opacity-90"
          disabled={isBusy}
          type="submit"
        >
          {status === "loading" ? (
            <m.span
              aria-hidden
              className="absolute inset-y-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.45),transparent)]"
              initial={{ x: "-150%" }}
              animate={{ x: "350%" }}
              transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
            />
          ) : null}
          <span className="relative">{status === "loading" ? "Salvando..." : "Salvar nova senha"}</span>
          <span className="absolute right-5 grid h-8 w-8 place-items-center">
            {status === "loading" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : status === "success" ? (
              <ShieldCheck className="h-5 w-5" />
            ) : (
              <LockKeyhole className="h-5 w-5" />
            )}
          </span>
        </button>
      </m.form>

      <AnimatePresence>
        {status === "success" ? (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[80] grid place-items-center bg-[#040404]"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(196,154,69,0.18),transparent_30rem)]" />
            <m.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="relative flex flex-col items-center gap-4 text-center"
            >
              <span className="grid h-16 w-16 place-items-center rounded-full border border-gold/40 bg-black/40 text-gold shadow-[0_0_40px_rgba(196,154,69,0.25)]">
                <ShieldCheck className="h-7 w-7" strokeWidth={1.6} />
              </span>
              <p className="font-serif text-2xl text-gold">Senha atualizada. Entrando no portal...</p>
              <p className="text-sm text-zinc-400">Zucchi Luxury Stones</p>
            </m.div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

type PasswordFieldProps = {
  name: string;
  placeholder: string;
  value: string;
  show: boolean;
  disabled: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
};

function PasswordField({ name, placeholder, value, show, disabled, onToggle, onChange }: PasswordFieldProps) {
  return (
    <label
      className={cn(
        "group flex h-[3.35rem] items-center rounded-lg border border-white/14 bg-black/38 text-zinc-200 transition duration-200 focus-within:border-gold/78 focus-within:bg-black/54"
      )}
    >
      <span className="sr-only">{placeholder}</span>
      <span className="grid h-full w-[3.35rem] shrink-0 place-items-center border-r border-white/10 text-gold">
        <LockKeyhole className="h-5 w-5" strokeWidth={1.65} />
      </span>
      <input
        disabled={disabled}
        className="h-full min-w-0 flex-1 bg-transparent px-4 text-[0.95rem] text-white outline-none placeholder:text-zinc-500 disabled:opacity-70"
        name={name}
        placeholder={placeholder}
        type={show ? "text" : "password"}
        value={value}
        autoComplete="new-password"
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        aria-label={show ? "Ocultar senha" : "Mostrar senha"}
        className="grid h-full w-12 shrink-0 place-items-center text-zinc-400 transition hover:text-gold"
        onClick={onToggle}
        type="button"
      >
        {show ? <EyeOff className="h-5 w-5" strokeWidth={1.65} /> : <Eye className="h-5 w-5" strokeWidth={1.65} />}
      </button>
    </label>
  );
}
