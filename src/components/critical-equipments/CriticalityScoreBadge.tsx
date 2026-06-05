import type { CriticalityLabel } from "@/types/critical-equipments";
import { CRITICALITY_BADGE_CLASS } from "@/components/critical-equipments/criticality";

type CriticalityScoreBadgeProps = {
  score: number;
  label: CriticalityLabel;
  showScore?: boolean;
};

export function CriticalityScoreBadge({ score, label, showScore = true }: CriticalityScoreBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-bold ${CRITICALITY_BADGE_CLASS[label]}`}
    >
      {showScore ? <span className="tabular-nums">{score}</span> : null}
      <span className="uppercase tracking-wide">{label}</span>
    </span>
  );
}
