import { useState } from "react";
import { GitCompareArrows, Loader2, Pencil, RotateCcw } from "lucide-react";
import type { ApiError } from "../api/client";
import { RunComparison } from "../components/RunComparison";
import { StatusBanner } from "../components/StatusBanner";
import { fmtMs, TRAFFIC_LABELS } from "../lib/format";
import { STRATEGY_ORDER, strategyColor } from "../lib/series";
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

export function ComparePage(props: Props) {
  const { config, comparison, comparing, error } = props;
  const [selected, setSelected] = useState<StrategyKey[]>(STRATEGY_ORDER);
  const [selectedRuns, setSelectedRuns] = useState<string[]>([]);

  const toggle = (k: StrategyKey) =>
    setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : STRATEGY_ORDER.filter((x) => s.includes(x) || x === k)));
  const toggleRun = (id: string) => setSelectedRuns((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-6)));
  const label = (k: StrategyKey) => props.strategies.find((s) => s.key === k)?.label ?? k;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight">Compare strategies on identical traffic</h1>
        <p className="mt-3 max-w-[70ch] text-base leading-relaxed text-ink-2">
          A fair comparison changes one thing. The controlled comparison clones your current settings and seed, and runs the same workload once per queue
          strategy. You can also compare earlier runs; QueueWise then lists every parameter that differs.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="panel flex flex-col p-5" aria-labelledby="controlled-title">
          <h2 id="controlled-title" className="section-title">
            Controlled comparison
          </h2>
          {config ? (
            <>
              <div className="mt-3 rounded-lg border border-line bg-canvas/50 p-3 text-sm text-ink-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">{props.scenarioLabel}</span>
                  <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={props.onEditSettings}>
                    <Pencil size={13} aria-hidden="true" /> Edit in Simulation Lab
                  </button>
                </div>
                <div className="mt-1 text-xs leading-relaxed">
                  {config.link.capacity_mbps} Mbps link · {config.link.propagation_delay_ms} ms propagation · {config.link.queue_capacity_kb} KB buffer ·{" "}
                  {config.simulation.duration_ms / 1000} s · budget {config.simulation.delay_budget_ms} ms · seed {config.simulation.seed}
                </div>
                <ul className="mt-1.5 text-xs">
                  {config.flows.map((f) => (
                    <li key={f.flow_id}>
                      {f.name}: {TRAFFIC_LABELS[f.traffic_type].toLowerCase()}, {f.offered_rate_mbps} Mbps
                    </li>
                  ))}
                </ul>
              </div>
              <fieldset className="mt-4">
                <legend className="mb-2 text-sm font-semibold text-ink">Strategies to run (at least two)</legend>
                <div className="flex flex-wrap gap-2">
                  {STRATEGY_ORDER.map((k) => (
                    <label
                      key={k}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                        selected.includes(k) ? "border-line-strong bg-raised text-ink" : "border-line text-ink-3"
                      }`}
                    >
                      <input type="checkbox" checked={selected.includes(k)} onChange={() => toggle(k)} className="accent-[var(--color-accent)]" />
                      <span className="h-0.5 w-4" style={{ background: strategyColor(k) }} aria-hidden="true" />
                      {label(k)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="mt-auto pt-5">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={comparing || selected.length < 2}
                  onClick={() => props.onCompareStrategies(selected)}
                >
                  {comparing ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <GitCompareArrows size={16} aria-hidden="true" />}
                  {comparing ? "Running comparison…" : "Run controlled comparison"}
                </button>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-ink-3">Settings load from the simulator. Start the backend, then open the Simulation Lab.</p>
          )}
        </section>

        <section className="panel flex flex-col p-5" aria-labelledby="saved-title">
          <h2 id="saved-title" className="section-title">
            Compare saved runs
          </h2>
          {props.sessionRuns.length === 0 ? (
            <p className="mt-3 text-sm text-ink-3">
              Runs you make in the Simulation Lab during this session appear here, with their settings and seed, so you can replay or compare them.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-ink-3">
                Select two to six runs; parameter mismatches will be highlighted. Replay loads a run's exact settings and seed back into the Lab.
              </p>
              <ul className="mt-3 max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
                {props.sessionRuns.map((r) => (
                  <li
                    key={r.run_id}
                    className={`flex items-center gap-1 rounded-md border pr-1.5 transition-colors ${
                      selectedRuns.includes(r.run_id) ? "border-line-strong bg-raised" : "border-line hover:border-line-strong"
                    }`}
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                      <input type="checkbox" checked={selectedRuns.includes(r.run_id)} onChange={() => toggleRun(r.run_id)} className="accent-[var(--color-accent)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ink">
                          {r.strategy_label} · {r.scenario_label}
                        </span>
                        <span className="block text-xs text-ink-3">
                          run {r.run_id} · seed {r.seed} · p95 {fmtMs(r.p95_queueing_delay_ms)} ms · {new Date(r.created_at).toLocaleTimeString()}
                        </span>
                      </span>
                    </label>
                    <button
                      type="button"
                      className="btn-ghost shrink-0 px-2 py-1 text-xs"
                      onClick={() => props.onReplay(r)}
                      title="Load this run's exact settings and seed into the Simulation Lab"
                    >
                      <RotateCcw size={13} aria-hidden="true" /> Replay
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-5">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={comparing || selectedRuns.length < 2}
                  onClick={() => props.onCompareRuns(selectedRuns)}
                >
                  <GitCompareArrows size={16} aria-hidden="true" /> Compare selected runs ({selectedRuns.length})
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {error && <StatusBanner error={error} validationHint="Open the Simulation Lab to fix these settings." />}

      {comparing && (
        <div className="panel flex items-center gap-3 p-5 text-sm text-ink-2" role="status" aria-live="polite">
          <Loader2 size={18} className="animate-spin text-accent" aria-hidden="true" /> Running the same workload under each strategy…
        </div>
      )}

      {comparison ? (
        <div className={comparing ? "pointer-events-none opacity-50" : ""}>
          <RunComparison comparison={comparison} />
        </div>
      ) : (
        !comparing && (
          <div className="rounded-xl border border-dashed border-line-strong p-5 text-sm text-ink-2">
            <div className="font-medium text-ink">No comparison yet</div>
            <p className="mt-1 max-w-[70ch]">
              Run a controlled comparison to see side-by-side metrics, overlaid charts, per-flow outcomes and evidence-based findings for each strategy.
            </p>
          </div>
        )
      )}
    </div>
  );
}
