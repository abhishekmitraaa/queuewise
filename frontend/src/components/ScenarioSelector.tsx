import type { Scenario } from "../types";

interface Props {
  scenarios: Scenario[];
  activeId: string | null;
  edited: boolean;
  onSelect: (s: Scenario) => void;
}

export function ScenarioSelector({ scenarios, activeId, edited, onSelect }: Props) {
  if (scenarios.length === 0) {
    return <p className="text-sm text-ink-3">Presets load from the simulator. Start the backend to see them.</p>;
  }
  return (
    <section aria-labelledby="presets-title">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
        <h2 id="presets-title" className="section-title">
          Start from a scenario
        </h2>
        <p className="text-sm text-ink-3">Each preset is a starting configuration, not an expected outcome.</p>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7" role="radiogroup" aria-label="Scenario presets">
        {scenarios.map((s) => {
          const active = s.id === activeId;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(s)}
              className={`group flex flex-col rounded-lg border px-3 py-2.5 text-left transition-colors ${
                active ? "border-accent bg-raised" : "border-line bg-panel hover:border-line-strong"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={`font-display text-[15px] font-semibold ${active ? "text-accent" : "text-ink"}`}>{s.short_label}</span>
                {active && edited && <span className="text-[11px] text-ink-3">edited</span>}
              </span>
              <span className="mt-1 line-clamp-3 text-xs leading-relaxed text-ink-3">{s.description}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
