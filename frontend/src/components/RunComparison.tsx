import { useMemo } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import type { Comparison, Metrics, RunResult } from "../types";
import { comparisonToCsv } from "../lib/exportData";
import { fmtJain, fmtMbps, fmtMs, fmtPct, TRAFFIC_LABELS } from "../lib/format";
import { strategyColor, strategyDash, SERIES_COLORS, SERIES_DASHES } from "../lib/series";
import { ExportControls } from "./ExportControls";
import { FindingsPanel } from "./FindingsPanel";
import { TimeSeriesChart, type ChartSeries } from "./TimeSeriesChart";

interface Props {
  comparison: Comparison;
}

const ROWS: { key: keyof Metrics; label: string; fmt: (v: number | null) => string; unit: string }[] = [
  { key: "mean_queueing_delay_ms", label: "Mean queueing delay", fmt: fmtMs, unit: "ms" },
  { key: "p95_queueing_delay_ms", label: "p95 queueing delay", fmt: fmtMs, unit: "ms" },
  { key: "mean_end_to_end_delay_ms", label: "Mean end-to-end delay", fmt: fmtMs, unit: "ms" },
  { key: "p95_end_to_end_delay_ms", label: "p95 end-to-end delay", fmt: fmtMs, unit: "ms" },
  { key: "throughput_mbps", label: "Throughput", fmt: fmtMbps, unit: "Mbps" },
  { key: "link_utilization", label: "Link utilization", fmt: (v) => fmtPct(v), unit: "" },
  { key: "drop_ratio", label: "Drop ratio", fmt: (v) => fmtPct(v), unit: "" },
  { key: "delay_budget_violation_ratio", label: "Over delay budget", fmt: (v) => fmtPct(v), unit: "" },
  { key: "jain_fairness_index", label: "Jain's fairness index", fmt: fmtJain, unit: "" },
];

function runLabels(runs: RunResult[]): string[] {
  const dup = new Set(runs.map((r) => r.strategy)).size < runs.length;
  return runs.map((r) => (dup ? `${r.strategy_label} (${r.run_id.slice(0, 6)})` : r.strategy_label));
}

function runStyle(runs: RunResult[], i: number) {
  const dup = new Set(runs.map((r) => r.strategy)).size < runs.length;
  return dup
    ? { color: SERIES_COLORS[i % SERIES_COLORS.length], dash: SERIES_DASHES[i % SERIES_DASHES.length] }
    : { color: strategyColor(runs[i].strategy), dash: strategyDash(runs[i].strategy) };
}

function formatValue(v: unknown): string {
  if (v === undefined) return "(absent)";
  if (v === null) return "null";
  return String(v);
}

export function RunComparison({ comparison }: Props) {
  const runs = comparison.runs;
  const labels = runLabels(runs);
  const first = runs[0].configuration;

  const data = useMemo(() => {
    const byTime = new Map<number, Record<string, number | null>>();
    runs.forEach((run, i) => {
      run.time_series.forEach((s) => {
        const row = byTime.get(s.time_ms) ?? { t: s.time_ms / 1000 };
        row[`d${i}`] = s.mean_queueing_delay_ms;
        row[`o${i}`] = s.queue_occupancy_bytes / 1024;
        row[`t${i}`] = s.throughput_mbps;
        row[`x${i}`] = s.cumulative_drops;
        byTime.set(s.time_ms, row);
      });
    });
    return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
  }, [runs]);

  const series = (prefix: string): ChartSeries[] =>
    runs.map((_, i) => ({ key: `${prefix}${i}`, label: labels[i], ...runStyle(runs, i) }));

  const flowIds = [...new Set(runs.flatMap((r) => r.per_flow.map((f) => f.flow_id)))];
  const sameBudget = new Set(runs.map((r) => r.configuration.simulation.delay_budget_ms)).size === 1;
  const sameCapacity = new Set(runs.map((r) => r.configuration.link.capacity_mbps)).size === 1;

  return (
    <section className="space-y-5" aria-labelledby="comparison-title">
      <div>
        <h2 id="comparison-title" className="font-display text-2xl font-semibold tracking-tight">
          {comparison.mode === "controlled" ? "Controlled comparison" : "Run comparison"}
        </h2>
        <p className="mt-1 text-sm text-ink-3">
          {runs.length} runs · comparison <code className="text-ink-2">{comparison.comparison_id}</code> · simulator v{comparison.simulator_version}
        </p>
      </div>

      {comparison.controlled ? (
        <div className="flex items-start gap-3 rounded-lg border border-positive/40 bg-positive/10 px-4 py-3 text-sm">
          <CircleCheck size={18} className="mt-0.5 shrink-0 text-positive" aria-hidden="true" />
          <div>
            <div className="font-semibold text-ink">Only the queue strategy differs</div>
            <div className="text-ink-2">
              Same traffic, seed ({first.simulation.seed}), link, buffer and duration for every run, so differences come from the strategy.
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-caution/50 bg-caution/10 px-4 py-3 text-sm">
          <div className="flex items-start gap-3">
            <TriangleAlert size={18} className="mt-0.5 shrink-0 text-caution" aria-hidden="true" />
            <div>
              <div className="font-semibold text-ink">Not a controlled comparison: {comparison.parameter_differences.length} parameter(s) differ</div>
              <div className="text-ink-2">Differences in results cannot be attributed to the queue strategy alone.</div>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead>
                <tr className="text-ink-3">
                  <th scope="col" className="py-1 pr-3 font-medium">Parameter</th>
                  {runs.map((r, i) => (
                    <th key={r.run_id} scope="col" className="px-3 py-1 font-medium">
                      {labels[i]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.parameter_differences.map((d) => (
                  <tr key={d.parameter} className="border-t border-caution/20">
                    <th scope="row" className="py-1.5 pr-3 font-mono font-normal text-ink">
                      {d.parameter}
                    </th>
                    {runs.map((r) => (
                      <td key={r.run_id} className="px-3 py-1.5 text-ink-2">
                        {formatValue(d.values[r.run_id])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${runs.length >= 3 ? "xl:grid-cols-3" : ""}`}>
        {runs.map((r, i) => {
          const st = runStyle(runs, i);
          const m = r.metrics;
          const budget = r.configuration.simulation.delay_budget_ms;
          const cells: [string, string][] = [
            ["Mean end-to-end delay", `${fmtMs(m.mean_end_to_end_delay_ms)} ms`],
            ["Throughput", `${fmtMbps(m.throughput_mbps)} Mbps`],
            ["Drop ratio", fmtPct(m.drop_ratio)],
            [`Over ${budget} ms budget`, fmtPct(m.delay_budget_violation_ratio)],
            ["Jain's index", fmtJain(m.jain_fairness_index)],
          ];
          return (
            <div key={r.run_id} className="panel p-4">
              <div className="flex items-center gap-2">
                <svg width="22" height="6" aria-hidden="true">
                  <line x1="0" y1="3" x2="22" y2="3" stroke={st.color} strokeWidth="3" strokeDasharray={st.dash || undefined} />
                </svg>
                <span className="font-display text-base font-semibold text-ink">{labels[i]}</span>
              </div>
              <div className="mt-2 font-display text-[28px] font-semibold leading-none tracking-tight text-ink">
                {fmtMs(m.p95_queueing_delay_ms)} <span className="text-sm font-normal text-ink-3">ms p95 queueing delay</span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                {cells.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2 border-b border-line/50 pb-1">
                    <dt className="text-ink-3">{k}</dt>
                    <dd className="font-medium text-ink tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>

      <div className="panel overflow-x-auto p-4">
        <table className="w-full min-w-[620px] text-left text-sm">
          <caption className="mb-3 text-left">
            <span className="block font-display text-[15px] font-semibold text-ink">Side-by-side metrics</span>
            <span className="block text-xs text-ink-3">★ marks the best measured value in each row (lower delay, drops and violations; higher throughput, utilization and fairness).</span>
          </caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-3 text-xs font-medium text-ink-3">Metric</th>
              {runs.map((r, i) => {
                const st = runStyle(runs, i);
                return (
                  <th key={r.run_id} scope="col" className="px-3 py-2 text-right">
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                      <svg width="18" height="6" aria-hidden="true">
                        <line x1="0" y1="3" x2="18" y2="3" stroke={st.color} strokeWidth="2.5" strokeDasharray={st.dash || undefined} />
                      </svg>
                      {labels[i]}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key} className="border-b border-line/60 last:border-0">
                <th scope="row" className="py-2 pr-3 font-normal text-ink-2">
                  {row.label}
                  {row.unit && <span className="text-ink-3"> ({row.unit})</span>}
                </th>
                {runs.map((r) => {
                  const best = comparison.best[row.key as string]?.includes(r.run_id) && runs.length > 1;
                  return (
                    <td key={r.run_id} className={`px-3 py-2 text-right tabular-nums ${best ? "font-semibold text-ink" : "text-ink-2"}`}>
                      {best && <span className="mr-1 text-accent" aria-label="best">★</span>}
                      {row.fmt(r.metrics[row.key] as number | null)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TimeSeriesChart
          title="Queueing delay over time"
          description="Mean wait per sampling interval, each strategy on the same workload."
          unit="ms"
          data={data}
          series={series("d")}
          references={sameBudget ? [{ y: first.simulation.delay_budget_ms, label: `budget ${first.simulation.delay_budget_ms} ms` }] : []}
        />
        <TimeSeriesChart title="Queue occupancy over time" unit="KB" data={data} series={series("o")} digits={1} />
        <TimeSeriesChart
          title="Throughput over time"
          unit="Mbps"
          data={data}
          series={series("t")}
          references={sameCapacity ? [{ y: first.link.capacity_mbps, label: `capacity ${first.link.capacity_mbps} Mbps` }] : []}
        />
        <TimeSeriesChart title="Cumulative drops (overflow + AQM)" unit="packets" data={data} series={series("x")} digits={0} stepped />
      </div>

      <div className="panel overflow-x-auto p-4">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="mb-3 text-left">
            <span className="block font-display text-[15px] font-semibold text-ink">Per-flow outcomes by strategy</span>
            <span className="block text-xs text-ink-3">Throughput (Mbps) · p95 queueing delay (ms) · loss for each flow.</span>
          </caption>
          <thead>
            <tr className="border-b border-line text-xs text-ink-3">
              <th scope="col" className="py-2 pr-3 font-medium">Flow</th>
              {runs.map((r, i) => (
                <th key={r.run_id} scope="col" className="px-3 py-2 text-right font-medium">
                  {labels[i]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {flowIds.map((fid) => {
              const ref = runs.map((r) => r.per_flow.find((f) => f.flow_id === fid)).find(Boolean)!;
              return (
                <tr key={fid} className="border-b border-line/60 last:border-0">
                  <th scope="row" className="py-2.5 pr-3 font-normal">
                    <div className="font-medium text-ink">{ref.name}</div>
                    <div className="text-xs text-ink-3">{TRAFFIC_LABELS[ref.traffic_type]}</div>
                  </th>
                  {runs.map((r) => {
                    const f = r.per_flow.find((p) => p.flow_id === fid);
                    return (
                      <td key={r.run_id} className="px-3 py-2.5 text-right tabular-nums">
                        {f ? (
                          <>
                            <div className="text-ink">{fmtMbps(f.throughput_mbps)} Mbps</div>
                            <div className="text-xs text-ink-3">
                              p95 {fmtMs(f.p95_queueing_delay_ms)} ms · loss {fmtPct(f.loss_ratio)}
                            </div>
                          </>
                        ) : (
                          <span className="text-ink-3">not in this run</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <FindingsPanel
        findings={comparison.findings}
        title="What the comparison shows"
        intro="Statements are generated from the measured differences between these runs; none assumes a winner in advance."
      />

      <section className="panel p-4" aria-labelledby="cmp-config-title">
        <h3 id="cmp-config-title" className="font-display text-[15px] font-semibold text-ink">
          Configuration and seeds
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {runs.map((r, i) => {
            const c = r.configuration;
            return (
              <div key={r.run_id} className="rounded-lg border border-line bg-canvas/50 p-3 text-xs text-ink-2">
                <div className="mb-1.5 text-sm font-semibold text-ink">{labels[i]}</div>
                <div>run {r.run_id} · seed {c.simulation.seed}</div>
                <div>
                  link {c.link.capacity_mbps} Mbps · {c.link.propagation_delay_ms} ms · buffer {c.link.queue_capacity_kb} KB
                </div>
                <div>
                  {c.simulation.duration_ms} ms run · {c.simulation.sampling_interval_ms} ms samples · budget {c.simulation.delay_budget_ms} ms
                </div>
                <div>
                  AQM target {c.aqm.target_ms} ms / interval {c.aqm.interval_ms} ms · quantum {c.aqm.quantum_bytes} B
                </div>
                <ul className="mt-1.5 space-y-0.5">
                  {c.flows.map((f) => (
                    <li key={f.flow_id}>
                      {f.name}: {TRAFFIC_LABELS[f.traffic_type].toLowerCase()}, {f.offered_rate_mbps} Mbps, {f.packet_size_bytes} B, {f.start_ms}–{f.stop_ms} ms
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <ExportControls
        filenameBase={`queuewise-comparison-${comparison.comparison_id}`}
        json={() => comparison}
        csv={() => comparisonToCsv(comparison)}
        label="Export this comparison"
      />
    </section>
  );
}
