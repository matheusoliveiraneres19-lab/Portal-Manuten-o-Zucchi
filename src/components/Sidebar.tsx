"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  Factory,
  FileBarChart,
  FileText,
  Gauge,
  Home,
  LockKeyhole,
  Settings,
  ShieldCheck,
  ShoppingCart,
  UsersRound
} from "lucide-react";

const menu = [
  { label: "Início", href: "/dashboard", icon: Home },
  { label: "Dashboard Geral", href: "/dashboard/geral", icon: Gauge },
  { label: "Ordens de Serviço", href: "/dashboard/ordens-servico", icon: ClipboardList },
  { label: "Compras Realizadas", href: "/dashboard/compras-realizadas", icon: ShoppingCart },
  { label: "Compras Pendentes", href: "/dashboard/compras-pendentes", icon: FileBarChart },
  { label: "Lubrificantes", href: "/dashboard/lubrificantes", icon: LockKeyhole },
  { label: "Equipamentos Críticos", href: "/dashboard/equipamentos-criticos", icon: ShieldCheck },
  { label: "PC-Factory", href: "/dashboard/pc-factory", icon: Factory },
  { label: "Procedimentos", href: "/dashboard/procedimentos", icon: FileText },
  { label: "Equipe e Horas", href: "/dashboard/equipe-horas", icon: UsersRound },
  { label: "Relatórios", href: "/dashboard/relatorios", icon: BarChart3 },
  { label: "Configurações", href: "/dashboard/configuracoes", icon: Settings }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="marble-dark fixed inset-y-0 left-0 z-40 hidden w-80 border-r border-gold/20 p-5 text-champagne shadow-2xl lg:flex lg:flex-col">
      <div className="flex flex-col items-center border-b border-gold/20 pb-5">
        <Image
          src="/images/brand/zucchi-logo-oficial.png"
          alt="Brasão oficial Zucchi"
          width={429}
          height={508}
          priority
          sizes="8rem"
          className="h-32 w-auto object-contain drop-shadow-[0_12px_30px_rgba(0,0,0,0.5)]"
        />
        <div className="mt-2 text-[11px] font-bold uppercase tracking-[0.32em] text-champagne">Luxury Stones</div>
      </div>

      <nav className="mt-5 flex-1 space-y-2 overflow-y-auto pr-1">
        {menu.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href === "/dashboard" && pathname === "/");

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              href={item.href}
              key={item.label}
              className={`flex h-12 w-full items-center gap-3 rounded-lg px-4 text-left text-sm transition ${
                isActive
                  ? "border border-gold/40 bg-[#4a3918] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_20px_rgba(0,0,0,0.24)]"
                  : "text-zinc-200 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "text-champagne" : "text-gold"}`} />
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="stone-veins mt-5 rounded-lg border border-gold/40 bg-black/40 p-5 text-center shadow-premium">
        <p className="font-serif text-xl leading-snug text-champagne drop-shadow">
          Tradição, excelência e precisão em cada detalhe.
        </p>
        <div className="mx-auto mt-4 grid h-14 w-14 rotate-45 place-items-center border border-gold/70">
          <span className="-rotate-45 font-serif text-2xl text-gold">Z</span>
        </div>
      </div>
    </aside>
  );
}
