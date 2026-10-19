import { useRef } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Scenario } from "../types";

interface Props {
  scenarios: Scenario[];
  activeId: string | null;
  edited: boolean;
  onSelect: (s: Scenario) => void;
}

function facts(s: Scenario): string[] {
  const c = s.config;
  const flows = c.flows.length;
  return [`${c.link.capacity_mbps} Mbps link`, `${c.link.queue_capacity_kb} KB buffer`, `${flows} flow${flows === 1 ? "" : "s"}`];
}

export function ScenarioSelector({ scenarios, activeId, edited, onSelect }: Props) {
  const rail = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => rail.current?.scrollBy({ left: dir * 300, behavior: "smooth" });

  if (scenarios.length === 0) {
    return (
      <div className="flex gap-3 overflow-hidden" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-[148px] w-[268px] shrink-0 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <section aria-labelledby="presets-title">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 id="presets-title" className="section-title">
            Start from a scenario
          </h2>
          <p className="mt-1 text-sm text-ink-3">Starting configurations, not expected outcomes. Every value stays editable.</p>
        </div>
        <div className="hidden gap-2 sm:flex">
          <button type="button" className="btn-secondary h-9 w-9 p-0" onClick={() => scroll(-1)} aria-label="Scroll scenarios left">
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button type="button" className="btn-secondary h-9 w-9 p-0" onClick={() => scroll(1)} aria-label="Scroll scenarios right">
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div
        ref={rail}
        className="rail -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6"
        role="radiogroup"
        aria-label="Scenario presets"
      >
        {scenarios.map((s) => {
          const active = s.id === activeId;
          return (
            <motion.button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(s)}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="relative flex w-[268px] shrink-0 snap-start flex-col rounded-2xl border border-line bg-panel p-4 text-left"
            >
              {active && (
                <motion.span
                  layoutId="scenario-active"
                  className="pointer-events-none absolute -inset-px rounded-2xl border-2 border-accent bg-accent-soft/40"
                  transition={{ type: "spring", stiffness: 380, damping: 34 }}
                />
              )}
              <span className="relative flex items-center justify-between gap-2">
                <span className={`font-semibold tracking-tight ${active ? "text-accent" : "text-ink"}`}>{s.short_label}</span>
                {active && edited && <span className="rounded-full bg-raised px-2 py-0.5 text-[11px] text-ink-2">edited</span>}
              </span>
              <span className="relative mt-1.5 line-clamp-2 text-[13px] leading-snug text-ink-3">{s.description}</span>
              <span className="relative mt-3 flex flex-wrap gap-1.5">
                {facts(s).map((f) => (
                  <span key={f} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-2">
                    {f}
                  </span>
                ))}
              </span>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
