"use client";

import { useState } from "react";
import { Bell } from "lucide-react";

const alertsEnabled = false;
const disabledMessage = "Alertas serão ativados após a implementação do banco de dados.";

export function AlertsButton() {
  const [isOpen, setIsOpen] = useState(false);

  function handleClick() {
    if (!alertsEnabled) {
      setIsOpen((value) => !value);
    }
  }

  return (
    <div className="relative">
      <button
        aria-expanded={isOpen}
        aria-label="Alertas"
        className="relative grid h-11 w-11 place-items-center rounded-lg border border-gold/20 bg-black/45 text-champagne transition hover:border-gold/55 hover:text-gold"
        onClick={handleClick}
        type="button"
      >
        <Bell className="h-5 w-5" />
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-72 rounded-lg border border-gold/25 bg-ink/95 p-4 text-sm leading-relaxed text-champagne shadow-[0_18px_48px_rgba(0,0,0,0.42)] backdrop-blur">
          <div className="mb-2 text-[0.68rem] font-bold uppercase tracking-[0.22em] text-gold">
            Alertas
          </div>
          <p>{disabledMessage}</p>
        </div>
      ) : null}
    </div>
  );
}
