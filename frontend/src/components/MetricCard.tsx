import type { ReactNode } from "react";
import { motion } from "motion/react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { riseChild } from "../lib/motion";

export type MetricTone = "neutral" | "positive" | "caution";

interface Props {
  label: string;
  value: ReactNode;
  unit?: string;
  detail?: ReactNode;
  definition: string;
  tone?: MetricTone;
  toneLabel?: string;
  className?: string;
  children?: ReactNode;
  size?: "md" | "lg";
}

export function ToneBadge({ tone, label }: { tone: MetricTone; label: string }) {
  if (tone === "neutral") return <span className="text-[11px] text-ink-3">{label}</span>;
  const Icon = tone === "positive" ? CircleCheck : TriangleAlert;
  const cls = tone === "positive" ? "bg-positive/12 text-positive" : "bg-caution/12 text-caution";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      <Icon size={12} aria-hidden="true" />
      {label}
    </span>
  );
}

/** A metric tile. Animates in as part of the results stagger. */
export function MetricCard({ label, value, unit, detail, definition, tone = "neutral", toneLabel, className = "", children, size = "md" }: Props) {
  return (
    <motion.div variants={riseChild} className={`panel flex min-w-0 flex-col p-5 ${className}`} title={definition}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-ink-2">{label}</span>
        {toneLabel && <ToneBadge tone={tone} label={toneLabel} />}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className={`num truncate font-semibold leading-none text-ink ${size === "lg" ? "text-5xl md:text-6xl" : "text-3xl"}`}>{value}</span>
        {unit && <span className="text-sm text-ink-3">{unit}</span>}
      </div>
      {detail && <div className="mt-2.5 text-xs leading-relaxed text-ink-3">{detail}</div>}
      {children}
    </motion.div>
  );
}
