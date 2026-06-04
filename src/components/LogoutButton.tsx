"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { clearTemporarySession } from "@/lib/auth.client";

export function LogoutButton() {
  const router = useRouter();

  function handleLogout() {
    clearTemporarySession();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      aria-label="Sair do portal"
      className="grid h-11 w-11 place-items-center rounded-lg border border-gold/20 bg-black/45 text-champagne transition hover:border-gold/55 hover:text-gold"
      onClick={handleLogout}
      title="Sair"
      type="button"
    >
      <LogOut className="h-5 w-5" />
    </button>
  );
}
