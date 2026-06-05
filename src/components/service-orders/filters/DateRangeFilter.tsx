"use client";

type DateRangeFilterProps = {
  label: string;
  startDate: string;
  endDate: string;
  onChange: (next: { startDate: string; endDate: string }) => void;
};

export function DateRangeFilter({ label, startDate, endDate, onChange }: DateRangeFilterProps) {
  return (
    <div className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          value={startDate}
          max={endDate || undefined}
          onChange={(event) => onChange({ startDate: event.target.value, endDate })}
          className={inputClassName}
          aria-label={`${label} - data inicial`}
        />
        <input
          type="date"
          value={endDate}
          min={startDate || undefined}
          onChange={(event) => onChange({ startDate, endDate: event.target.value })}
          className={inputClassName}
          aria-label={`${label} - data final`}
        />
      </div>
    </div>
  );
}

const inputClassName =
  "h-10 w-full rounded-lg border border-gold/15 bg-black/35 px-2.5 text-sm text-zinc-100 outline-none transition [color-scheme:dark] focus:border-gold/55 focus:bg-black/50 focus:shadow-[0_0_0_3px_rgba(196,154,69,0.10)]";
