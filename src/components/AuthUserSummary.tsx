"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Crown, Wrench } from "lucide-react";
import { FALLBACK_USER } from "@/lib/auth";
import { getStoredAuthUser } from "@/lib/auth.client";
import type { AuthUser } from "@/types/auth";

export function AuthUserSummary() {
  const [user, setUser] = useState<AuthUser>(FALLBACK_USER);

  useEffect(() => {
    setUser(getStoredAuthUser());
  }, []);

  return (
    <div className="hidden items-center gap-3 border-l border-white/10 pl-4 sm:flex">
      <div className="relative grid h-11 w-11 place-items-center rounded-full border border-gold/50 bg-[#132a37]">
        <Crown className="absolute -top-1 h-4 w-4 text-gold" />
        <Wrench className="h-5 w-5 text-gold" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold">{user.name}</div>
        <div className="text-xs text-zinc-400">{user.role}</div>
      </div>
      <ChevronDown className="h-4 w-4 text-champagne" />
    </div>
  );
}
