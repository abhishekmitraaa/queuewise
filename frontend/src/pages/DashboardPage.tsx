import { GitCompareArrows, Loader2, Play, RotateCcw } from "lucide-react";
import type { ApiError } from "../api/client";
import { ConfigurationPanel } from "../components/ConfigurationPanel";
import { QueueTopology } from "../components/QueueTopology";
import { RunResults } from "../components/RunResults";
import { ScenarioSelector } from "../components/ScenarioSelector";
import { StatusBanner } from "../components/StatusBanner";
import type { BackendStatus } from "../components/AppShell";
import { drainTimeMs, fmtMs } from "../lib/format";
import type { RunResult, Scenario, SimulationConfig, StrategyInfo } from "../types";

interface Props {
  status: BackendStatus;
  scenarios: Scenario[];
  strategies: StrategyInfo[];
  maxFlows: number;
  config: SimulationConfig | null;
  activeScenario: Scenario | null;
  edited: boolean;
  run: RunResult | null;
  runScenarioLabel: string | null;
  stale: boolean;
  running: boolean;
  error: ApiError | null;
  onConfigChange: (c: SimulationConfig) => void;
  onSelectScenario: (s: Scenario) => void;
  onReset: () => void;
  onRun: () => void;
  onCompareAll: () => void;
  onReloadPresets: () => void;
}

export function DashboardPage(props: Props) {
  const { config, run, running, error } = props;
  const bufferMs = config ? drainTimeMs(config.link.queue_capacity_kb, config.link.capacity_mbps) : NaN;

  return (
    <div className="space-y-10">
      <header className="grid grid-cols-1 items-end gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">Understand latency under load</h1>
          <p className="mt-4 max-w-[62ch] text-base leading-relaxed text-ink-2">
            When a bottleneck link is full, packets wait in its queue. A big queue keeps the link busy but makes every packet wait longer:
            that is <em className="not-italic text-ink">bufferbloat</em>. QueueWise simulates one bottleneck so you can watch the queue grow and compare queue
            strategies on exactly the same traffic.
          </p>
        </div>
        {config && Number.isFinite(bufferMs) && (
          <div className="rounded-xl border border-line bg-panel px-5 py-4">
            <p className="text-sm leading-relaxed text-ink-2">With the current settings, a full buffer holds</p>
            <p className="mt-1 font-display text-3xl font-semibold tracking-tight text-accent">
              {fmtMs(bufferMs)} ms <span className="text-lg font-medium text-ink-2">of waiting</span>
            </p>
            <p className="mt-1 text-sm text-ink-3">
              {config.link.queue_capacity_kb} KB × 8 ÷ {config.link.capacity_mbps} Mbps, before a packet even starts to cross the link.
            </p>
          </div>
        )}
      </header>

      <ScenarioSelector scenarios={props.scenarios} activeId={props.activeScenario?.id ?? null} edited={props.edited} onSelect={props.onSelectScenario} />

      {!config ? (
        <div className="panel flex flex-col items-start gap-3 p-6">
          {props.status === "offline" ? (
            <>
              <div className="font-display text-lg font-semibold">The simulator backend is not running</div>
              <p className="max-w-[70ch] text-sm text-ink-2">
                Start it from the <code>backend</code> folder with <code className="text-ink">.venv\Scripts\python -m uvicorn app.main:app --port 8000</code> (see README), then
                load the presets.
              </p>
              <button type="button" className="btn-secondary" onClick={props.onReloadPresets}>
                <RotateCcw size={15} aria-hidden="true" /> Load presets
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-ink-2">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Loading presets from the simulator…
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <section className="panel p-5" aria-labelledby="config-title">
            <div className="mb-5 flex items-baseline justify-between gap-3">
              <h2 id="config-title" className="section-title">
                Configuration
              </h2>
              <span className="truncate text-xs text-ink-3">
                {props.activeScenario ? `${props.activeScenario.label}${props.edited ? " (edited)" : ""}` : "Custom"}
              </span>
            </div>
            <ConfigurationPanel
              config={config}
              strategies={props.strategies}
              errors={error?.errors ?? []}
              maxFlows={props.maxFlows}
              onChange={props.onConfigChange}
            />
          </section>

          <div className="flex min-w-0 flex-col gap-5 self-start xl:sticky xl:top-20">
            <section className="panel p-5" aria-labelledby="topology-title">
              <h2 id="topology-title" className="section-title mb-3">
                The bottleneck
              </h2>
              <QueueTopology config={config} run={run} stale={props.stale} />
              <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
                <button type="button" className="btn-primary px-5" onClick={props.onRun} disabled={running}>
                  {running ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
                  {running ? "Running simulation…" : "Run simulation"}
                </button>
                <button type="button" className="btn-secondary" onClick={props.onReset} disabled={running}>
                  <RotateCcw size={15} aria-hidden="true" /> Reset to preset
                </button>
                <button type="button" className="btn-ghost ml-auto" onClick={props.onCompareAll} disabled={running}>
                  <GitCompareArrows size={16} aria-hidden="true" /> Compare all strategies
                </button>
              </div>
            </section>

            {error && <StatusBanner error={error} onRetry={props.onRun} validationHint="The fields are highlighted in the configuration panel." />}

            {!run && !running && !error && (
              <div className="rounded-xl border border-dashed border-line-strong p-5 text-sm text-ink-2">
                <div className="font-medium text-ink">No results yet</div>
                <p className="mt-1 max-w-[70ch]">
                  Pick a scenario, adjust the settings if you like, then select <strong className="text-ink">Run simulation</strong>. You will get delay,
                  throughput, drop and fairness metrics, time-series charts, per-flow outcomes and plain-language findings, all computed by the simulator.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {running && (
        <div className="panel flex items-center gap-3 p-5 text-sm text-ink-2" role="status" aria-live="polite">
          <Loader2 size={18} className="animate-spin text-accent" aria-hidden="true" />
          Simulating {config ? config.simulation.duration_ms / 1000 : ""} s of traffic through the bottleneck…
        </div>
      )}

      {run && (
        <div className={running ? "pointer-events-none opacity-50 transition-opacity" : "transition-opacity"} aria-busy={running}>
          <RunResults run={run} scenarioLabel={props.runScenarioLabel} stale={props.stale} />
        </div>
      )}
    </div>
  );
}
