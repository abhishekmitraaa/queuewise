import { AnimatePresence, motion } from "motion/react";
import { GitCompareArrows, Loader2, Play, RotateCcw } from "lucide-react";
import type { ApiError } from "../api/client";
import { ConfigurationPanel } from "../components/ConfigurationPanel";
import { QueueTopology } from "../components/QueueTopology";
import { ResultsSkeleton, RunResults } from "../components/RunResults";
import { ScenarioSelector } from "../components/ScenarioSelector";
import { StatusBanner } from "../components/StatusBanner";
import type { BackendStatus } from "../components/AppShell";
import { drainTimeMs, fmtMs } from "../lib/format";
import { AnimatedNumber, EASE_OUT, riseChild, staggerParent } from "../lib/motion";
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
    <div className="flex flex-col gap-14">
      <motion.header variants={staggerParent} initial="hidden" animate="show" className="grid grid-cols-1 items-end gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <motion.h1 variants={riseChild} className="max-w-[16ch] text-4xl font-semibold leading-[1.02] tracking-tighter md:text-5xl lg:text-6xl">
            Understand latency under load
          </motion.h1>
          <motion.p variants={riseChild} className="mt-5 max-w-[52ch] text-base leading-relaxed text-ink-2 md:text-lg">
            Simulate one congested link, watch its queue grow, and compare queue strategies on exactly the same traffic.
          </motion.p>
        </div>
        {config && Number.isFinite(bufferMs) && (
          <motion.div variants={riseChild} className="panel relative overflow-hidden border-l-4 border-l-accent p-6">
            <p className="relative text-sm text-ink-2">With these settings, a full buffer adds</p>
            <p className="relative mt-2 flex items-baseline gap-2">
              <span className="num text-5xl font-semibold tracking-tight text-accent md:text-6xl">
                <AnimatedNumber value={bufferMs} format={fmtMs} />
              </span>
              <span className="text-lg font-medium text-ink-2">ms of waiting</span>
            </p>
            <p className="relative mt-3 text-sm leading-relaxed text-ink-3">
              {config.link.queue_capacity_kb} KB × 8 ÷ {config.link.capacity_mbps} Mbps, before a packet even starts across the link. When the link
              stays congested, that wait is bufferbloat.
            </p>
          </motion.div>
        )}
      </motion.header>

      <ScenarioSelector scenarios={props.scenarios} activeId={props.activeScenario?.id ?? null} edited={props.edited} onSelect={props.onSelectScenario} />

      {!config ? (
        <div className="panel flex flex-col items-start gap-3 p-6">
          {props.status === "offline" ? (
            <>
              <div className="text-lg font-semibold">The simulator backend is not running</div>
              <p className="max-w-[70ch] text-sm text-ink-2">
                Start it from the <code>backend</code> folder with{" "}
                <code className="num rounded bg-raised px-1.5 py-0.5 text-ink">.venv\Scripts\python -m uvicorn app.main:app --port 8000</code> (see README), then
                load the presets.
              </p>
              <button type="button" className="btn-secondary" onClick={props.onReloadPresets}>
                <RotateCcw size={15} aria-hidden="true" /> Load presets
              </button>
            </>
          ) : (
            <div className="flex w-full flex-col gap-3" aria-live="polite">
              <span className="sr-only">Loading presets from the simulator</span>
              <div className="skeleton h-6 w-48 rounded-full" />
              <div className="skeleton h-40 rounded-xl" />
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <section className="panel p-6" aria-labelledby="config-title">
            <div className="mb-6 flex items-baseline justify-between gap-3">
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

          <div className="flex min-w-0 flex-col gap-5 self-start xl:sticky xl:top-24">
            <section className="panel relative overflow-hidden p-6" aria-labelledby="topology-title">
              {running && (
                <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-accent-soft" aria-hidden="true">
                  <div className="progress-indeterminate h-full w-2/5 rounded-full bg-accent" />
                </div>
              )}
              <div className="mb-5 flex flex-wrap items-center gap-2.5">
                <h2 id="topology-title" className="section-title mr-auto">
                  The bottleneck
                </h2>
                <button type="button" className="btn-ghost" onClick={props.onReset} disabled={running}>
                  <RotateCcw size={15} aria-hidden="true" /> Reset to preset
                </button>
                <button type="button" className="btn-secondary" onClick={props.onCompareAll} disabled={running}>
                  <GitCompareArrows size={15} aria-hidden="true" /> Compare all strategies
                </button>
                <button type="button" className="btn-primary px-5" onClick={props.onRun} disabled={running}>
                  {running ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
                  {running ? "Running simulation" : "Run simulation"}
                </button>
              </div>
              <QueueTopology config={config} run={run} stale={props.stale} running={running} />
            </section>

            <AnimatePresence>
              {error && <StatusBanner key="error" error={error} onRetry={props.onRun} validationHint="The fields are highlighted in the configuration panel." />}
            </AnimatePresence>

            {!run && !running && !error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-2xl border border-dashed border-line-strong p-5 text-sm text-ink-2"
              >
                <div className="font-medium text-ink">No results yet</div>
                <p className="mt-1 max-w-[70ch]">
                  Pick a scenario, adjust the settings if you like, then select <strong className="text-ink">Run simulation</strong>. Delay, throughput, drop and
                  fairness metrics, charts, per-flow outcomes and findings all come from the simulator.
                </p>
              </motion.div>
            )}
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {running && !run ? (
          <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <ResultsSkeleton label={`Simulating ${config ? config.simulation.duration_ms / 1000 : ""} s of traffic through the bottleneck`} />
          </motion.div>
        ) : run ? (
          <motion.div
            key={run.run_id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: running ? 0.45 : 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.45, ease: EASE_OUT }}
            className={running ? "pointer-events-none" : ""}
            aria-busy={running}
          >
            <RunResults run={run} scenarioLabel={props.runScenarioLabel} stale={props.stale} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
