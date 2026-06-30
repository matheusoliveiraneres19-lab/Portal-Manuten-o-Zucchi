"use client";

import { useState } from "react";
import { FileText, Gauge, PlayCircle } from "lucide-react";

type TabKey = "passo" | "videoaula" | "materiais";

type ProcedureTabsProps = {
  passoAPasso: React.ReactNode;
  videoaula: React.ReactNode;
  materiais: React.ReactNode;
  /** Indicador de quantidade na aba Videoaula (vídeos cadastrados). */
  videoCount?: number;
  /** Indicador de quantidade na aba Materiais de apoio. */
  materiaisCount?: number;
};

const TABS: { key: TabKey; label: string; icon: typeof Gauge }[] = [
  { key: "passo", label: "Passo a passo", icon: Gauge },
  { key: "videoaula", label: "Videoaula", icon: PlayCircle },
  { key: "materiais", label: "Materiais de apoio", icon: FileText }
];

export function ProcedureTabs({ passoAPasso, videoaula, materiais, videoCount = 0, materiaisCount = 0 }: ProcedureTabsProps) {
  const [active, setActive] = useState<TabKey>("passo");

  const countFor = (key: TabKey): number | null => {
    if (key === "videoaula") return videoCount;
    if (key === "materiais") return materiaisCount;
    return null;
  };

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Seções do procedimento"
        className="flex flex-wrap gap-1.5 rounded-2xl border border-[#C6A24A]/25 bg-[#11100C]/70 p-1.5"
      >
        {TABS.map(({ key, label, icon: Icon }) => {
          const isActive = active === key;
          const count = countFor(key);
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(key)}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold transition sm:flex-none ${
                isActive
                  ? "border border-[#D6AA3A]/55 bg-[#D6AA3A]/15 text-[#F6D98B] shadow-[0_6px_18px_rgba(0,0,0,0.25)]"
                  : "border border-transparent text-[#B8AD9A] hover:text-white"
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? "text-[#D6AA3A]" : ""}`} />
              <span className="whitespace-nowrap">{label}</span>
              {count != null && count > 0 ? (
                <span className="ml-0.5 rounded-full bg-[#D6AA3A]/20 px-1.5 text-[10px] font-bold text-[#F6D98B]">{count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" hidden={active !== "passo"} className="space-y-4">
        {active === "passo" ? passoAPasso : null}
      </div>
      <div role="tabpanel" hidden={active !== "videoaula"} className="space-y-4">
        {active === "videoaula" ? videoaula : null}
      </div>
      <div role="tabpanel" hidden={active !== "materiais"} className="space-y-4">
        {active === "materiais" ? materiais : null}
      </div>
    </div>
  );
}
