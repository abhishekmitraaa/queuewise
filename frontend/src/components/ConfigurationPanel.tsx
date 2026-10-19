import { ChevronDown, Plus, Trash2 } from "lucide-react";
import type { FieldError, FlowConfig, SimulationConfig, StrategyInfo, StrategyKey, TrafficType } from "../types";
import { RATE_LABELS, TRAFFIC_LABELS, drainTimeMs, fmtMs } from "../lib/format";
import { flowColor } from "../lib/series";
import { NumberField, SelectField, TextField } from "./Field";

interface Props {
  config: SimulationConfig;
  strategies: StrategyInfo[];
  errors: FieldError[];
  maxFlows: number;
  onChange: (c: SimulationConfig) => void;
  showStrategy?: boolean;
}

const TRAFFIC_OPTIONS = (Object.keys(TRAFFIC_LABELS) as TrafficType[]).map((t) => ({ value: t, label: TRAFFIC_LABELS[t] }));

function newFlowId(flows: FlowConfig[]): string {
  let i = flows.length + 1;
  while (flows.some((f) => f.flow_id === `flow${i}`)) i++;
  return `flow${i}`;
}

export function ConfigurationPanel({ config, strategies, errors, maxFlows, onChange, showStrategy = true }: Props) {
  const err = (field: string) => errors.find((e) => e.field === field || e.field === `base_config.${field}`)?.message;

  const setLink = (patch: Partial<SimulationConfig["link"]>) => onChange({ ...config, link: { ...config.link, ...patch } });
  const setSim = (patch: Partial<SimulationConfig["simulation"]>) =>
    onChange({ ...config, simulation: { ...config.simulation, ...patch } });
  const setAqm = (patch: Partial<SimulationConfig["aqm"]>) => onChange({ ...config, aqm: { ...config.aqm, ...patch } });
  const setFlow = (i: number, patch: Partial<FlowConfig>) =>
    onChange({ ...config, flows: config.flows.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const removeFlow = (i: number) => onChange({ ...config, flows: config.flows.filter((_, j) => j !== i) });
  const addFlow = () => {
    const id = newFlowId(config.flows);
    onChange({
      ...config,
      flows: [
        ...config.flows,
        {
          flow_id: id,
          name: "Interactive (voice/game)",
          traffic_type: "constant_rate",
          offered_rate_mbps: 1,
          packet_size_bytes: 300,
          start_ms: Math.min(1000, config.simulation.duration_ms / 10),
          stop_ms: config.simulation.duration_ms,
          burst_on_ms: 200,
          burst_off_ms: 300,
        },
      ],
    });
  };

  const bufferMs = drainTimeMs(config.link.queue_capacity_kb, config.link.capacity_mbps);
  const selected = strategies.find((s) => s.key === config.strategy);
  const flowsError = err("flows");

  return (
    <div className="space-y-6">
      {showStrategy && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Queue strategy</legend>
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-canvas p-1" role="radiogroup" aria-label="Queue strategy">
            {(strategies.length ? strategies : [{ key: config.strategy, short_label: config.strategy } as StrategyInfo]).map((s) => {
              const active = s.key === config.strategy;
              return (
                <button
                  key={s.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange({ ...config, strategy: s.key as StrategyKey })}
                  className={`rounded-md px-2 py-2 text-xs font-medium leading-tight transition-colors sm:text-sm ${
                    active ? "bg-raised text-ink shadow-[inset_0_0_0_1px_var(--color-accent)]" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  {s.short_label}
                </button>
              );
            })}
          </div>
          {selected && <p className="mt-2 text-xs leading-relaxed text-ink-3">{selected.description}</p>}
        </fieldset>
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Bottleneck link</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NumberField label="Capacity (Mbps)" value={config.link.capacity_mbps} min={0.1} onChange={(v) => setLink({ capacity_mbps: v })} error={err("link.capacity_mbps")} />
          <NumberField label="Propagation delay (ms)" value={config.link.propagation_delay_ms} min={0} onChange={(v) => setLink({ propagation_delay_ms: v })} error={err("link.propagation_delay_ms")} />
          <NumberField
            label="Queue capacity (KB)"
            value={config.link.queue_capacity_kb}
            min={1}
            onChange={(v) => setLink({ queue_capacity_kb: v })}
            error={err("link.queue_capacity_kb")}
            hint={Number.isFinite(bufferMs) ? `Full buffer ≈ ${fmtMs(bufferMs)} ms of waiting` : undefined}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Experiment</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <NumberField label="Duration (ms)" value={config.simulation.duration_ms} min={100} step={500} onChange={(v) => setSim({ duration_ms: v })} error={err("simulation.duration_ms")} />
          <NumberField
            label="Queueing delay budget (ms)"
            value={config.simulation.delay_budget_ms}
            min={0.1}
            onChange={(v) => setSim({ delay_budget_ms: v })}
            error={err("simulation.delay_budget_ms")}
            hint={
              <span className="flex flex-wrap items-center gap-1.5">
                Quick pick:
                {[5, 20, 50].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSim({ delay_budget_ms: v })}
                    aria-pressed={config.simulation.delay_budget_ms === v}
                    className={`rounded border px-1.5 py-0.5 text-[11px] transition-colors ${
                      config.simulation.delay_budget_ms === v ? "border-accent text-accent" : "border-line text-ink-2 hover:border-line-strong"
                    }`}
                  >
                    {v} ms
                  </button>
                ))}
              </span>
            }
          />
        </div>
      </fieldset>

      <fieldset>
        <div className="mb-2 flex items-center justify-between">
          <legend className="text-sm font-semibold text-ink">
            Traffic flows <span className="font-normal text-ink-3">({config.flows.length}/{maxFlows})</span>
          </legend>
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={addFlow} disabled={config.flows.length >= maxFlows}>
            <Plus size={14} aria-hidden="true" /> Add flow
          </button>
        </div>
        {flowsError && <p className="mb-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{flowsError}</p>}
        <div className="space-y-3">
          {config.flows.map((flow, i) => (
            <div key={i} className="rounded-lg border border-line bg-canvas/60 p-3">
              <div className="mb-3 flex items-start gap-2">
                <span className="mt-[30px] h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: flowColor(i) }} aria-hidden="true" />
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                  <TextField label={`Flow ${i + 1} name`} value={flow.name} maxLength={60} onChange={(v) => setFlow(i, { name: v })} error={err(`flows.${i}.name`)} />
                  <SelectField label="Traffic type" value={flow.traffic_type} options={TRAFFIC_OPTIONS} onChange={(v) => setFlow(i, { traffic_type: v })} error={err(`flows.${i}.traffic_type`)} />
                </div>
                <button
                  type="button"
                  className="btn-ghost mt-[22px] px-2 py-1.5"
                  onClick={() => removeFlow(i)}
                  disabled={config.flows.length <= 1}
                  aria-label={`Remove flow ${flow.name || i + 1}`}
                  title="Remove flow"
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <NumberField label={RATE_LABELS[flow.traffic_type]} value={flow.offered_rate_mbps} min={0} onChange={(v) => setFlow(i, { offered_rate_mbps: v })} error={err(`flows.${i}.offered_rate_mbps`)} />
                <NumberField label="Packet size (B)" value={flow.packet_size_bytes} min={64} max={9000} step={1} onChange={(v) => setFlow(i, { packet_size_bytes: v })} error={err(`flows.${i}.packet_size_bytes`)} />
                <NumberField label="Start (ms)" value={flow.start_ms} min={0} step={100} onChange={(v) => setFlow(i, { start_ms: v })} error={err(`flows.${i}.start_ms`)} />
                <NumberField label="Stop (ms)" value={flow.stop_ms} min={0} step={100} onChange={(v) => setFlow(i, { stop_ms: v })} error={err(`flows.${i}.stop_ms`)} />
              </div>
              {flow.traffic_type === "bursty" && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <NumberField label="Mean ON period (ms)" value={flow.burst_on_ms} min={1} onChange={(v) => setFlow(i, { burst_on_ms: v })} error={err(`flows.${i}.burst_on_ms`)} />
                  <NumberField label="Mean OFF period (ms)" value={flow.burst_off_ms} min={1} onChange={(v) => setFlow(i, { burst_off_ms: v })} error={err(`flows.${i}.burst_off_ms`)} />
                </div>
              )}
              {flow.traffic_type === "tcp_like" && (
                <p className="mt-2 text-xs text-ink-3">Backs off when its packets are dropped (AIMD). The rate above is its maximum sending rate.</p>
              )}
              {err(`flows.${i}.flow_id`) && <p className="mt-2 text-xs text-danger">{err(`flows.${i}.flow_id`)}</p>}
            </div>
          ))}
        </div>
      </fieldset>

      <details className="group rounded-lg border border-line">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
          Advanced: sampling, seed and AQM parameters
          <ChevronDown size={16} className="text-ink-3 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="grid grid-cols-1 gap-3 border-t border-line p-3 sm:grid-cols-2">
          <NumberField label="Sampling interval (ms)" value={config.simulation.sampling_interval_ms} min={1} onChange={(v) => setSim({ sampling_interval_ms: v })} error={err("simulation.sampling_interval_ms")} hint="Spacing of chart samples" />
          <NumberField label="Random seed" value={config.simulation.seed} min={0} step={1} onChange={(v) => setSim({ seed: v })} error={err("simulation.seed")} hint="Same seed + settings = same result" />
          <NumberField label="AQM target delay (ms)" value={config.aqm.target_ms} min={0.1} onChange={(v) => setAqm({ target_ms: v })} error={err("aqm.target_ms")} hint="Acceptable standing queue delay" />
          <NumberField label="AQM interval (ms)" value={config.aqm.interval_ms} min={1} onChange={(v) => setAqm({ interval_ms: v })} error={err("aqm.interval_ms")} hint="How long delay must persist before dropping" />
          <NumberField label="FQ quantum (bytes)" value={config.aqm.quantum_bytes} min={64} step={1} onChange={(v) => setAqm({ quantum_bytes: v })} error={err("aqm.quantum_bytes")} hint="Bytes each flow may send per round" />
        </div>
      </details>
    </div>
  );
}
