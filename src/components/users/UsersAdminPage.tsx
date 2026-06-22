"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldAlert,
  UserPlus,
  UsersRound
} from "lucide-react";
import type { AdminUserRow } from "@/services/users.service";

type UsersAdminPageProps = {
  users: AdminUserRow[];
  currentLogin: string;
};

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Administrador" },
  { value: "GESTOR", label: "Gestor" },
  { value: "TECNICO", label: "Técnico" },
  { value: "COMPRAS", label: "Compras" },
  { value: "VISUALIZADOR", label: "Visualizador" }
] as const;

const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label]));

const inputClass =
  "h-11 w-full rounded-lg border border-gold/20 bg-black/40 px-3 text-sm text-zinc-100 outline-none transition [color-scheme:dark] placeholder:text-zinc-500 focus:border-gold/60";

function generatePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "@#$%&*!?";
  const all = upper + lower + digits + symbols;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  const base = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  for (let i = 0; i < 8; i += 1) base.push(pick(all));
  return base.sort(() => Math.random() - 0.5).join("");
}

export function UsersAdminPage({ users, currentLogin }: UsersAdminPageProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("TECNICO");
  const [password, setPassword] = useState("");
  const [requireChange, setRequireChange] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ login: string; password: string } | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setCreated(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, login, email: email || undefined, role, temporaryPassword: password, requirePasswordChange: requireChange })
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        setError(result.message ?? "Falha ao criar usuário.");
        toast.error(result.message ?? "Falha ao criar usuário.");
        return;
      }

      toast.success("Usuário criado com sucesso.");
      setCreated({ login: result.user.login, password });
      setName("");
      setLogin("");
      setEmail("");
      setRole("TECNICO");
      setPassword("");
      setRequireChange(true);
      refresh();
    } catch {
      setError("Falha ao criar usuário. Tente novamente.");
      toast.error("Falha ao criar usuário.");
    } finally {
      setSubmitting(false);
    }
  }

  async function patchUser(id: string, body: Record<string, unknown>, successMsg: string) {
    setRowBusy(id);
    try {
      const response = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        toast.error(result.message ?? "Falha ao atualizar usuário.");
        return;
      }
      toast.success(successMsg);
      refresh();
    } catch {
      toast.error("Falha ao atualizar usuário.");
    } finally {
      setRowBusy(null);
    }
  }

  async function copyCredentials() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(`Login: ${created.login}\nSenha temporária: ${created.password}`);
      toast.success("Credenciais copiadas.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <section className="space-y-4 text-champagne">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-lg border border-gold/20 bg-[#070808] p-5 shadow-premium sm:p-6">
        <div className="login-marble-bg absolute inset-0 opacity-80" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.78),rgba(0,0,0,0.44)),radial-gradient(circle_at_88%_8%,rgba(196,154,69,0.15),transparent_22rem)]" />
        <div className="relative z-10">
          <div className="mb-3 flex items-center gap-3 text-gold">
            <UsersRound className="h-5 w-5" />
            <span className="rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-champagne/80">
              Administração de acessos
            </span>
          </div>
          <h1 className="font-serif text-3xl leading-tight text-white sm:text-4xl">Usuários</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300 sm:text-base">
            Crie acessos com senha temporária. No primeiro login, o usuário é obrigado a definir uma nova senha.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Form de criação */}
        <article className="panel rounded-lg p-5 xl:col-span-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-[#5a3d12]">
            <UserPlus className="h-4 w-4" /> Novo usuário
          </h2>

          <form className="space-y-3" onSubmit={handleSubmit}>
            <Field label="Nome">
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" disabled={submitting} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Login">
                <input className={inputClass} value={login} onChange={(e) => setLogin(e.target.value)} placeholder="ex.: joao.silva" disabled={submitting} autoCapitalize="none" />
              </Field>
              <Field label="Papel">
                <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value)} disabled={submitting}>
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="E-mail (opcional)">
              <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@zucchi.local" disabled={submitting} />
            </Field>
            <Field label="Senha temporária">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    className={`${inputClass} pr-10`}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mín. 8, com letra e número"
                    disabled={submitting}
                    autoComplete="off"
                  />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 transition hover:text-gold" aria-label={showPassword ? "Ocultar" : "Mostrar"}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => { setPassword(generatePassword()); setShowPassword(true); }}
                  disabled={submitting}
                  className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-gold/30 px-3 text-xs font-semibold text-gold transition hover:bg-gold/10"
                >
                  <KeyRound className="h-4 w-4" /> Gerar
                </button>
              </div>
            </Field>

            <label className="flex items-center gap-2 pt-1 text-sm text-zinc-700">
              <input type="checkbox" checked={requireChange} onChange={(e) => setRequireChange(e.target.checked)} className="h-4 w-4 accent-[#c49a45]" disabled={submitting} />
              Exigir troca de senha no primeiro acesso
            </label>

            {error ? (
              <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-gold/55 bg-[linear-gradient(180deg,#f5d48a,#d49c45_55%,#b77b2c)] text-sm font-bold text-[#11100d] transition hover:brightness-110 disabled:opacity-70"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {submitting ? "Criando..." : "Criar usuário"}
            </button>
          </form>

          {created ? (
            <div className="mt-4 rounded-lg border border-[#3f8f6b]/40 bg-[#3f8f6b]/10 p-3 text-sm text-[#2f6e51]">
              <div className="mb-1 flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" /> Usuário criado — entregue as credenciais com segurança
              </div>
              <p className="font-mono text-[13px] text-zinc-800">
                Login: <strong>{created.login}</strong>
                <br />
                Senha temporária: <strong>{created.password}</strong>
              </p>
              <button onClick={copyCredentials} className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[#3f8f6b]/40 px-2.5 py-1 text-xs font-semibold transition hover:bg-[#3f8f6b]/15">
                <Copy className="h-3.5 w-3.5" /> Copiar credenciais
              </button>
            </div>
          ) : null}
        </article>

        {/* Tabela de usuários */}
        <article className="panel rounded-lg p-5 xl:col-span-7">
          <h2 className="mb-3 flex items-center justify-between text-sm font-extrabold uppercase tracking-wide text-[#5a3d12]">
            <span>Usuários cadastrados ({users.length})</span>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin text-gold" /> : null}
          </h2>

          {users.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">Nenhum usuário para exibir.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-[11px] font-extrabold uppercase tracking-wide text-zinc-500">
                    <th className="py-2 pr-3">Usuário</th>
                    <th className="px-2 py-2">Papel</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">1º acesso</th>
                    <th className="py-2 pl-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const isSelf = user.login === currentLogin;
                    const busy = rowBusy === user.id;
                    return (
                      <tr key={user.id} className="border-b border-zinc-100 text-zinc-800 last:border-0">
                        <td className="py-2 pr-3">
                          <div className="font-semibold">{user.name}</div>
                          <div className="text-[12px] text-zinc-500">{user.login}{user.email ? ` · ${user.email}` : ""}</div>
                        </td>
                        <td className="px-2 py-2">{ROLE_LABEL[user.role] ?? user.role}</td>
                        <td className="px-2 py-2">
                          <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${user.status === "ATIVO" ? "bg-[#3f8f6b]/15 text-[#2f6e51]" : "bg-zinc-200 text-zinc-600"}`}>
                            {user.status === "ATIVO" ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          {user.mustChangePassword ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-gold/15 px-2 py-0.5 text-xs font-bold text-[#7a5a16]">
                              <ShieldAlert className="h-3 w-3" /> Trocar senha
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="py-2 pl-2">
                          <div className="flex items-center justify-end gap-1.5">
                            {!user.mustChangePassword ? (
                              <button
                                disabled={busy}
                                onClick={() => patchUser(user.id, { mustChangePassword: true }, "Troca de senha exigida no próximo acesso.")}
                                title="Forçar troca de senha no próximo acesso"
                                className="inline-flex items-center gap-1 rounded-md border border-gold/30 px-2 py-1 text-[11px] font-semibold text-[#7a5a16] transition hover:bg-gold/10 disabled:opacity-50"
                              >
                                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Forçar troca
                              </button>
                            ) : null}
                            {!isSelf ? (
                              <button
                                disabled={busy}
                                onClick={() => patchUser(user.id, { status: user.status === "ATIVO" ? "INATIVO" : "ATIVO" }, "Status atualizado.")}
                                className="inline-flex items-center rounded-md border border-zinc-300 px-2 py-1 text-[11px] font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50"
                              >
                                {user.status === "ATIVO" ? "Inativar" : "Ativar"}
                              </button>
                            ) : (
                              <span className="text-[11px] text-zinc-400">você</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
    </label>
  );
}
