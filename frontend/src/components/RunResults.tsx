import { useMemo } from "react";
import type { RunResult } from "../types";
import { fmtInt, fmtJain, fmtKB, fmtMbps, fmtMs, fmtPct } from "../lib/format";
import { runToCsv } from "../lib/exportData";
import { flowColor, flowDash } from "../lib/series";
import { ExportControls } from "./ExportControls";
import { FindingsPanel } from "./FindingsPanel";
import { FlowTable } from "./FlowTable";
import { MetricCard } from "./MetricCard";
import { TimeSeriesChart, type ChartSeries } from "./TimeSeriesChart";

export const METRIC_DEFINITIONS: { term: string; definition: string }[] = [
  { term: "Queueing delay", definition: "Time from entering the queue until transmission starts. Mean and p95 are over delivered packets." },
  { term: "End-to-end delay", definition: "Queueing delay + serialization delay (packet bits ÷ link rate) + propagation delay. No other processing delay is modelled." },
  { term: "Throughput", definition: "Delivered packet bits ÷ the full simulation duration, in Mbps (1 Mbps = 1,000,000 bit/s)." },
  { term: "Link utilization", definition: "Bits whose transmission completed ÷ (link capacity × duration)." },
  { term: "Drop ratio", definition: "Dropped packets ÷ generated packets. Overflow drops (buffer full) and AQM drops are also shown separately." },
  { term: "Delay-budget violations", definition: "Share of delivered packets whose queueing delay was strictly greater than the delay budget." },
  { term: "Jain's fairness index", definition: "(Σx)² ÷ (n·Σx²) over flows, where x is each flow's throughput divided by its max-min fair share. 1.0 = every flow got its fair share; 1/n = one flow got everything." },
  { term: "Queue occupancy", definition: "Bytes waiting in the queue(s) at each sample time (1 KB = 1024 bytes), sampled after all events at that instant." },
];

interface Props {
  run: RunResult;
  scenarioLabel: string | null;
  stale: boolean;
}

export function RunResults({ run, scenarioLabel, stale }: Props) {
  const m = run.metrics;
  const cfg = run.configuration;
  const budget = cfg.simulation.delay_budget_ms;
  const multiFlow = cfg.flows.length > 1;
  const tcpFlows = cfg.flows.map((f, i) => ({ f, i })).filter(({ f }) => f.traffic_type === "tcp_like");

  const data = useMemo(
    () =>
      run.time_series.map((s) => {
        const row: Record<string, number | null> = {
          t: s.time_ms / 1000,
          delay: s.mean_queueing_delay_ms,
          e2e: s.mean_end_to_end_delay_ms,
          occupancy: s.queue_occupancy_bytes / 1024,
          throughput: s.throughput_mbps,
          overflow: s.cumulative_overflow_drops,
          aqm: s.cumulative_aqm_drops,
        };
        cfg.flows.forEach((f) => {
          row[`tp_${f.flow_id}`] = s.per_flow_throughput_mbps[f.flow_id] ?? null;
          row[`qd_${f.flow_id}`] = s.per_flow_queueing_delay_ms[f.flow_id] ?? null;
          if (f.traffic_type === "tcp_like") row[`cw_${f.flow_id}`] = s.per_flow_cwnd_packets?.[f.flow_id] ?? null;
        });
        return row;
      }),
    [run, cfg.flows],
  );

  const flowSeries = (prefix: string): ChartSeries[] =>
    cfg.flows.map((f, i) => ({ key: `${prefix}${f.flow_id}`, label: f.name, color: flowColor(i), dash: flowDash(i) }));

  const p95 = m.p95_queueing_delay_ms;
  const overBudget = p95 !== null && p95 > budget;

  return (
    <section aria-labelledby="results-title" className="space-y-5">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="mr-auto">
          <h2 id="results-title" className="font-display text-2xl font-semibold tracking-tight">
            Results: {run.strategy_label}
          </h2>
          <p className="mt-1 text-sm text-ink-3">
            {scenarioLabel ? `${scenarioLabel} · ` : ""}seed {cfg.simulation.seed} · {cfg.simulation.duration_ms / 1000} s simulated in {run.runtime_ms} ms · run{" "}
            <code className="text-ink-2">{run.run_id}</code> · simulator v{run.simulator_version}
          </p>
        </div>
        {stale && (
          <p className="rounded-md border border-caution/40 bg-caution/10 px-3 py-1.5 text-xs text-caution" role="status">
            Settings have changed since this run. Run again to update the results.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Mean queueing delay"
          value={fmtMs(m.mean_queueing_delay_ms)}
          unit="ms"
          definition={METRIC_DEFINITIONS[0].definition}
          detail={`max ${fmtMs(m.max_queueing_delay_ms)} ms over ${fmtInt(m.packets_delivered)} delivered packets`}
        />
        <MetricCard
          label="p95 queueing delay"
          value={fmtMs(p95)}
          unit="ms"
          definition="95% of delivered packets waited no longer than this in the queue."
          tone={p95 === null ? "neutral" : overBudget ? "caution" : "positive"}
          toneLabel={p95 === null ? undefined : overBudget ? `over ${budget} ms budget` : `within ${budget} ms budget`}
          detail={`Averages can hide tail latency; p95 shows what the slowest 5% experience.`}
        />
        <MetricCard
          label="End-to-end delay"
          value={fmtMs(m.mean_end_to_end_delay_ms)}
          unit="ms mean"
          definition={METRIC_DEFINITIONS[1].definition}
          detail={`p95 ${fmtMs(m.p95_end_to_end_delay_ms)} ms, including ${cfg.link.propagation_delay_ms} ms propagation`}
        />
        <MetricCard
          label="Throughput"
          value={fmtMbps(m.throughput_mbps)}
          unit="Mbps"
          definition={METRIC_DEFINITIONS[2].definition}
          detail={`${fmtPct(m.link_utilization)} link utilization · offered ${fmtMbps(m.offered_load_mbps)} Mbps`}
        />
        <MetricCard
          label="Packets dropped"
          value={fmtPct(m.drop_ratio)}
          definition={METRIC_DEFINITIONS[4].definition}
          detail={`${fmtInt(m.packets_dropped_overflow)} overflow + ${fmtInt(m.packets_dropped_aqm)} AQM of ${fmtInt(m.packets_generated)} generated`}
        />
        <MetricCard
          label="Over delay budget"
          value={fmtPct(m.delay_budget_violation_ratio)}
          unit={`of packets > ${budget} ms`}
          definition={METRIC_DEFINITIONS[5].definition}
          tone={m.delay_budget_violation_ratio > 0.05 ? "caution" : "positive"}
          toneLabel={m.delay_budget_violation_ratio > 0.05 ? "above 5%" : "5% or less"}
        />
        <MetricCard
          label="Fairness (Jain's index)"
          value={fmtJain(m.jain_fairness_index)}
          definition={METRIC_DEFINITIONS[6].definition}
          detail={m.fairness_note ?? undefined}
        />
        <MetricCard
          label="Queue occupancy"
          value={fmtKB(m.mean_queue_occupancy_bytes)}
          unit="KB mean"
          definition={METRIC_DEFINITIONS[7].definition}
          detail={`peak ${fmtKB(m.peak_queue_occupancy_bytes)} KB of ${cfg.link.queue_capacity_kb} KB · ${fmtInt(m.packets_queued_at_end)} queued and ${fmtInt(m.packets_in_flight_at_end)} in flight at end`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TimeSeriesChart
          title="Queueing delay over time"
          description={`Mean wait of packets that started transmission in each ${cfg.simulation.sampling_interval_ms} ms interval.`}
          unit="ms"
          data={data}
          series={
            multiFlow
              ? flowSeries("qd_")
              : [{ key: "delay", label: "Mean queueing delay", color: flowColor(0) }]
          }
          references={[{ y: budget, label: `budget ${budget} ms` }]}
        />
        <TimeSeriesChart
          title="End-to-end delay over time"
          description={`Mean queueing + serialization + ${cfg.link.propagation_delay_ms} ms propagation delay of packets delivered in each interval.`}
          unit="ms"
          data={data}
          series={[{ key: "e2e", label: "Mean end-to-end delay", color: flowColor(0) }]}
        />
        <TimeSeriesChart
          title="Queue occupancy over time"
          description="Bytes waiting in the buffer at each sample."
          unit="KB"
          data={data}
          series={[{ key: "occupancy", label: "Queue occupancy", color: flowColor(0) }]}
          references={[{ y: cfg.link.queue_capacity_kb, label: `capacity ${cfg.link.queue_capacity_kb} KB` }]}
          digits={1}
        />
        <TimeSeriesChart
          title="Throughput over time"
          description="Delivered bits per sampling interval."
          unit="Mbps"
          data={data}
          series={multiFlow ? [{ key: "throughput", label: "Total", color: "#c9d3e3" }, ...flowSeries("tp_")] : [{ key: "throughput", label: "Throughput", color: flowColor(0) }]}
          references={[{ y: cfg.link.capacity_mbps, label: `capacity ${cfg.link.capacity_mbps} Mbps` }]}
        />
        <div className={`min-w-0 ${tcpFlows.length > 0 ? "" : "xl:col-span-2"}`}>
          <TimeSeriesChart
            title="Cumulative drops"
            description="Overflow drops happen when the buffer is full; AQM drops are deliberate early drops."
            unit="packets"
            data={data}
            series={[
              { key: "overflow", label: "Overflow (buffer full)", color: "#d95926" },
              { key: "aqm", label: "AQM drops", color: "#3987e5", dash: "6 4" },
            ]}
            digits={0}
            stepped
          />
        </div>
        {tcpFlows.length > 0 && (
          <div className="min-w-0">
          <TimeSeriesChart
            title="Congestion window of TCP-like flows"
            description="Packets the sender may have unacknowledged. It halves when the sender learns of a drop."
            unit="packets"
            data={data}
            series={tcpFlows.map(({ f, i }) => ({ key: `cw_${f.flow_id}`, label: f.name, color: flowColor(i), dash: flowDash(i) }))}
            digits={1}
          />
          </div>
        )}
      </div>

      <FlowTable flows={run.per_flow} budgetMs={budget} />
      <FindingsPanel findings={run.findings} />

      <details className="panel group p-4">
        <summary className="cursor-pointer list-none font-display text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
          Metric definitions <span className="text-xs font-normal text-ink-3">(show)</span>
        </summary>
        <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
          {METRIC_DEFINITIONS.map((d) => (
            <div key={d.term}>
              <dt className="text-sm font-medium text-ink">{d.term}</dt>
              <dd className="text-sm leading-relaxed text-ink-3">{d.definition}</dd>
            </div>
          ))}
        </dl>
      </details>

      <ExportControls filenameBase={`queuewise-run-${run.run_id}`} json={() => run} csv={() => runToCsv(run)} />
    </section>
  );
}
