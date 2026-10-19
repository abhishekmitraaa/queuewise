import type { ReactNode } from "react";

export type MetricTone = "neutral" | "positive" | "caution";

interface Props {
  label: string;
  value: string;
  unit?: string;
  detail?: ReactNode;
  definition: string;
  tone?: MetricTone;
  toneLabel?: string;
}

export function MetricCard({ label, value, unit, detail, definition, tone = "neutral", toneLabel }: Props) {
  const toneClass = tone === "positive" ? "text-positive" : tone === "caution" ? "text-caution" : "text-ink-3";
  return (
    <div className="panel flex min-w-0 flex-col px-4 py-3.5" title={definition}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-2">{label}</span>
        {toneLabel && (
          <span className={`flex items-center gap-1 text-[11px] font-medium ${toneClass}`}>
            <span aria-hidden="true">{tone === "positive" ? "✓" : tone === "caution" ? "!" : "·"}</span>
            {toneLabel}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="truncate font-display text-[28px] font-semibold leading-none tracking-tight text-ink">{value}</span>
        {unit && <span className="text-sm text-ink-3">{unit}</span>}
      </div>
      {detail && <div className="mt-2 text-xs leading-relaxed text-ink-3">{detail}</div>}
    </div>
  );
}
