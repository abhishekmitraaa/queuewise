import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { GitCompareArrows, Loader2, Pencil, RotateCcw } from "lucide-react";
import type { ApiError } from "../api/client";
import { RunComparison } from "../components/RunComparison";
import { StatusBanner } from "../components/StatusBanner";
import { fmtMs, TRAFFIC_LABELS } from "../lib/format";
import { EASE_OUT, riseChild, staggerParent } from "../lib/motion";
import { STRATEGY_ORDER, strategyColor, strategyDash } from "../lib/series";
import type { Comparison, SessionRun, SimulationConfig, StrategyInfo, StrategyKey } from "../types";

interface Props {
  config: SimulationConfig | null;
  scenarioLabel: string;
  strategies: StrategyInfo[];
  sessionRuns: SessionRun[];
  comparison: Comparison | null;
  comparing: boolean;
  error: ApiError | null;
  onCompareStrategies: (strategies: StrategyKey[]) => void;
  onCompareRuns: (runIds: string[]) => void;
  onReplay: (run: SessionRun) => void;
  onEditSettings: () => void;
}

type Mode = "controlled" | "saved";

export function ComparePage(props: Props) {
  const { config, comparison, comparing, error } = props;
  const [mode, setMode] = useState<Mode>("controlled");
  const [selected, setSelected] = useState<StrategyKey[]>(STRATEGY_ORDER);
  const [selectedRuns, setSelectedRuns] = useState<string[]>([]);

  const toggle = (k: StrategyKey) =>
    setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : STRATEGY_ORDER.filter((x) => s.includes(x) || x === k)));
  const toggleRun = (id: string) => setSelectedRuns((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-6)));
  const label = (k: StrategyKey) => props.strategies.find((s) => s.key === k)?.label ?? k;
  const modes: { id: Mode; label: string }[] = [
    { id: "controlled", label: "Controlled comparison" },
    { id: "saved", label: `Saved runs (${props.sessionRuns.length})` },
  ];

  return (
    <div className="flex flex-col gap-12">
      <motion.header variants={staggerParent} initial="hidden" animate="show">
        <motion.h1 variants={riseChild} className="max-w-[20ch] text-4xl font-semibold leading-[1.02] tracking-tighter md:text-5xl">
          Compare strategies on identical traffic
        </motion.h1>
        <motion.p variants={riseChild} className="mt-5 max-w-[56ch] text-base leading-relaxed text-ink-2 md:text-lg">
          Change one thing at a time. Same workload and seed, a different queue strategy, results side by side.
        </motion.p>
      </motion.header>

      <section className="panel p-6" aria-label="Comparison setup">
        <div className="inline-flex gap-1 rounded-full border border-line bg-canvas p-1" role="tablist" aria-label="Comparison type">
          {modes.map((m) => {
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMode(m.id)}
                className={`relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${active ? "text-canvas" : "text-ink-2 hover:text-ink"}`}
              >
                {active && <motion.span layoutId="compare-mode" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
                <span className="relative">{m.label}</span>
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            role="tabpanel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            className="mt-6"
          >
            {mode === "controlled" ? (
              config ? (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr]">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-semibold tracking-tight text-ink">{props.scenarioLabel}</h2>
                      <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={props.onEditSettings}>
                        <Pencil size={13} aria-hidden="true" /> Edit in Simulation Lab
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                      {[
                        `${config.link.capacity_mbps} Mbps link`,
                        `${config.link.propagation_delay_ms} ms propagation`,
                        `${config.link.queue_capacity_kb} KB buffer`,
                        `${config.simulation.duration_ms / 1000} s`,
                        `budget ${config.simulation.delay_budget_ms} ms`,
                        `seed ${config.simulation.seed}`,
                      ].map((c) => (
                        <span key={c} className="rounded-full border border-line px-2.5 py-1 text-ink-2">
                          {c}
                        </span>
                      ))}
                    </div>
                    <ul className="mt-4 space-y-1 text-sm text-ink-2">
                      {config.flows.map((f) => (
                        <li key={f.flow_id}>
                          <span className="text-ink">{f.name}</span>: {TRAFFIC_LABELS[f.traffic_type].toLowerCase()}, {f.offered_rate_mbps} Mbps
                        </li>
                      ))}
                    </ul>
                  </div>
                  <fieldset className="flex flex-col">
                    <legend className="mb-3 text-sm font-medium text-ink">Strategies to run (at least two)</legend>
                    <div className="flex flex-col gap-2">
                      {STRATEGY_ORDER.map((k) => {
                        const on = selected.includes(k);
                        return (
                          <label
                            key={k}
                            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
                              on ? "border-accent/50 bg-accent-soft/50 text-ink" : "border-line text-ink-3 hover:border-line-strong"
                            }`}
                          >
                            <input type="checkbox" checked={on} onChange={() => toggle(k)} className="h-4 w-4 accent-[var(--color-accent)]" />
                            <svg width="22" height="6" aria-hidden="true">
                              <line x1="0" y1="3" x2="22" y2="3" stroke={strategyColor(k)} strokeWidth="3" strokeLinecap="round" strokeDasharray={strategyDash(k) || undefined} />
                            </svg>
                            {label(k)}
                          </label>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      className="btn-primary mt-5 self-start px-5"
                      disabled={comparing || selected.length < 2}
                      onClick={() => props.onCompareStrategies(selected)}
                    >
                      {comparing ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <GitCompareArrows size={16} aria-hidden="true" />}
                      {comparing ? "Running comparison" : "Run controlled comparison"}
                    </button>
                  </fieldset>
                </div>
              ) : (
                <p className="text-sm text-ink-3">Settings load from the simulator. Start the backend, then open the Simulation Lab.</p>
              )
            ) : props.sessionRuns.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line-strong p-5 text-sm text-ink-2">
                <div className="font-medium text-ink">No saved runs yet</div>
                <p className="mt-1">Runs you make in the Simulation Lab during this session appear here, with their settings and seed, so you can replay or compare them.</p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-ink-3">Select two to six runs; mismatched parameters will be highlighted. Replay loads a run's exact settings and seed into the Lab.</p>
                <ul className="mt-4 grid max-h-[340px] grid-cols-1 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                  {props.sessionRuns.map((r) => {
                    const on = selectedRuns.includes(r.run_id);
                    return (
                      <motion.li
                        key={r.run_id}
                        layout
                        className={`flex items-center gap-1 rounded-xl border pr-2 transition-colors ${
                          on ? "border-accent/50 bg-accent-soft/50" : "border-line hover:border-line-strong"
                        }`}
                      >
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-4 py-3 text-sm">
                          <input type="checkbox" checked={on} onChange={() => toggleRun(r.run_id)} className="h-4 w-4 shrink-0 accent-[var(--color-accent)]" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-ink">
                              {r.strategy_label}, {r.scenario_label}
                            </span>
                            <span className="num block truncate text-xs text-ink-3">
                              run {r.run_id}, seed {r.seed}, p95 {fmtMs(r.p95_queueing_delay_ms)} ms, {new Date(r.created_at).toLocaleTimeString()}
                            </span>
                          </span>
                        </label>
                        <button
                          type="button"
                          className="btn-ghost shrink-0 px-3 py-1 text-xs"
                          onClick={() => props.onReplay(r)}
                          title="Load this run's exact settings and seed into the Simulation Lab"
                        >
                          <RotateCcw size={13} aria-hidden="true" /> Replay
                        </button>
                      </motion.li>
                    );
                  })}
                </ul>
                <button
                  type="button"
                  className="btn-primary mt-5 px-5"
                  disabled={comparing || selectedRuns.length < 2}
                  onClick={() => props.onCompareRuns(selectedRuns)}
                >
                  <GitCompareArrows size={16} aria-hidden="true" /> Compare selected runs ({selectedRuns.length})
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </section>

      <AnimatePresence>{error && <StatusBanner key="error" error={error} validationHint="Open the Simulation Lab to fix these settings." />}</AnimatePresence>

      <AnimatePresence mode="wait">
        {comparing && !comparison ? (
          <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4" aria-busy="true">
            <span className="sr-only">Running the same workload under each strategy</span>
            <div className="skeleton h-9 w-80 rounded-full" />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="skeleton h-44 rounded-2xl" />
              ))}
            </div>
            <div className="skeleton h-72 rounded-2xl" />
          </motion.div>
        ) : comparison ? (
          <motion.div
            key={comparison.comparison_id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: comparing ? 0.45 : 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.45, ease: EASE_OUT }}
            className={comparing ? "pointer-events-none" : ""}
            aria-busy={comparing}
          >
            <RunComparison comparison={comparison} />
          </motion.div>
        ) : (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-dashed border-line-strong p-6 text-sm text-ink-2">
            <div className="font-medium text-ink">No comparison yet</div>
            <p className="mt-1 max-w-[70ch]">
              Run a controlled comparison to see side-by-side metrics, overlaid charts, per-flow outcomes and evidence-based findings for each strategy.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
