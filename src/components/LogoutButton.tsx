"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { clearStoredUser } from "@/lib/auth.client";

export function LogoutButton() {
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    if (pending) {
      return;
    }
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* Mesmo se a chamada falhar, limpamos o estado local e voltamos ao login. */
    }
    clearStoredUser();
    window.location.assign("/login");
  }

  return (
    <button
      aria-label="Sair do portal"
      className="grid h-11 w-11 place-items-center rounded-lg border border-gold/20 bg-black/45 text-champagne transition hover:border-gold/55 hover:text-gold"
      disabled={pending}
      onClick={handleLogout}
      title="Sair"
      type="button"
    >
      <LogOut className="h-5 w-5" />
    </button>
  );
}
