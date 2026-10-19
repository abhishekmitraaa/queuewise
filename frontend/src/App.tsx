import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "./api/client";
import { AppShell, type BackendStatus } from "./components/AppShell";
import { ComparePage } from "./pages/ComparePage";
import { DashboardPage } from "./pages/DashboardPage";
import { MethodologyPage } from "./pages/MethodologyPage";
import { useHashRoute } from "./lib/useHashRoute";
import type { Comparison, RunResult, Scenario, SessionRun, SimulationConfig, StrategyInfo, StrategyKey } from "./types";

const HEALTH_POLL_MS = 15_000;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/** Key-order-independent JSON, so configs from different sources compare equal. */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

function toError(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError(e instanceof Error ? e.message : "Something went wrong.", -1);
}

export default function App() {
  const [route, navigate] = useHashRoute();
  const [status, setStatus] = useState<BackendStatus>("checking");
  const [version, setVersion] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [maxFlows, setMaxFlows] = useState(8);

  const [config, setConfig] = useState<SimulationConfig | null>(null);
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null);

  const [run, setRun] = useState<RunResult | null>(null);
  const [runScenarioLabel, setRunScenarioLabel] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<ApiError | null>(null);

  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<ApiError | null>(null);

  const [sessionRuns, setSessionRuns] = useState<SessionRun[]>([]);

  const loadPresets = useCallback(async () => {
    try {
      const [sc, st] = await Promise.all([api.scenarios(), api.strategies()]);
      setScenarios(sc.scenarios);
      setStrategies(st);
      setMaxFlows(sc.limits.max_flows);
      setStatus("online");
      setConfig((current) => {
        if (current) return current;
        const def = sc.scenarios.find((s) => s.id === sc.default_scenario_id) ?? sc.scenarios[0];
        setActiveScenario(def ?? null);
        return def ? clone(def.config) : null;
      });
    } catch {
      setStatus("offline");
    }
  }, []);

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const h = await api.health();
        if (cancelled) return;
        setVersion(h.version);
        setStatus("online");
      } catch {
        if (!cancelled) setStatus("offline");
      }
    };
    check();
    const id = window.setInterval(check, HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Load presets automatically once the backend comes back.
  useEffect(() => {
    if (status === "online" && scenarios.length === 0) loadPresets();
  }, [status, scenarios.length, loadPresets]);

  const edited = useMemo(
    () => !!(activeScenario && config && stableStringify({ ...activeScenario.config, strategy: config.strategy }) !== stableStringify(config)),
    [activeScenario, config],
  );
  const scenarioLabel = activeScenario ? `${activeScenario.label}${edited ? " (edited)" : ""}` : "Custom configuration";

  const stale = useMemo(() => !!(run && config && stableStringify(run.configuration) !== stableStringify(config)), [run, config]);

  const remember = (runs: RunResult[], label: string) =>
    setSessionRuns((prev) =>
      [
        ...runs.map((r) => ({
          run_id: r.run_id,
          strategy: r.strategy,
          strategy_label: r.strategy_label,
          scenario_id: activeScenario?.id ?? null,
          scenario_label: label,
          seed: r.configuration.simulation.seed,
          created_at: r.created_at,
          p95_queueing_delay_ms: r.metrics.p95_queueing_delay_ms,
          configuration: r.configuration,
        })),
        ...prev,
      ].slice(0, 20),
    );

  const replay = (r: SessionRun) => {
    setActiveScenario(scenarios.find((s) => s.id === r.scenario_id) ?? null);
    setConfig(clone(r.configuration));
    setRunError(null);
    navigate("lab");
  };

  const selectScenario = (s: Scenario) => {
    setActiveScenario(s);
    setConfig((c) => ({ ...clone(s.config), strategy: c?.strategy ?? s.config.strategy }));
    setRunError(null);
  };

  const reset = () => {
    const target = activeScenario ?? scenarios[0];
    if (!target) return;
    setActiveScenario(target);
    setConfig(clone(target.config));
    setRunError(null);
  };

  const runSimulation = async () => {
    if (!config) return;
    setRunning(true);
    setRunError(null);
    try {
      const result = await api.runSimulation(config);
      setRun(result);
      setRunScenarioLabel(scenarioLabel);
      remember([result], scenarioLabel);
      setStatus("online");
    } catch (e) {
      const err = toError(e);
      setRunError(err);
      if (err.isOffline) setStatus("offline");
    } finally {
      setRunning(false);
    }
  };

  const compareStrategies = async (keys: StrategyKey[]) => {
    if (!config) return;
    setComparing(true);
    setCompareError(null);
    try {
      const result = await api.compareStrategies(config, keys);
      setComparison(result);
      remember(result.runs, scenarioLabel);
    } catch (e) {
      const err = toError(e);
      setCompareError(err);
      if (err.isOffline) setStatus("offline");
    } finally {
      setComparing(false);
    }
  };

  // Saved runs are compared by re-simulating their stored configurations. The
  // simulator is deterministic, so results match the originals, and this works
  // on a stateless (serverless) backend too.
  const compareRuns = async (ids: string[]) => {
    setComparing(true);
    setCompareError(null);
    try {
      const configs = ids.map((id) => sessionRuns.find((r) => r.run_id === id)!.configuration);
      setComparison(await api.compareConfigs(configs));
    } catch (e) {
      setCompareError(toError(e));
    } finally {
      setComparing(false);
    }
  };

  return (
    <AppShell route={route} onNavigate={navigate} status={status} version={version}>
      {route === "lab" && (
        <DashboardPage
          status={status}
          scenarios={scenarios}
          strategies={strategies}
          maxFlows={maxFlows}
          config={config}
          activeScenario={activeScenario}
          edited={edited}
          run={run}
          runScenarioLabel={runScenarioLabel}
          stale={stale}
          running={running}
          error={runError}
          onConfigChange={setConfig}
          onSelectScenario={selectScenario}
          onReset={reset}
          onRun={runSimulation}
          onCompareAll={() => navigate("compare")}
          onReloadPresets={loadPresets}
        />
      )}
      {route === "compare" && (
        <ComparePage
          config={config}
          scenarioLabel={scenarioLabel}
          strategies={strategies}
          sessionRuns={sessionRuns}
          comparison={comparison}
          comparing={comparing}
          error={compareError}
          onCompareStrategies={compareStrategies}
          onCompareRuns={compareRuns}
          onReplay={replay}
          onEditSettings={() => navigate("lab")}
        />
      )}
      {route === "methodology" && <MethodologyPage />}
    </AppShell>
  );
}
