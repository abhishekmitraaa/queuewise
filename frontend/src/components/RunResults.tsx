import { useMemo, type ReactNode } from "react";
import { motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import type { RunResult } from "../types";
import { fmtInt, fmtJain, fmtKB, fmtMbps, fmtMs, fmtPct } from "../lib/format";
import { runToCsv } from "../lib/exportData";
import { TOTAL_COLOR, flowColor, flowDash } from "../lib/series";
import { AnimatedNumber, Reveal, staggerParent } from "../lib/motion";
import { ExportControls } from "./ExportControls";
import { FindingsPanel } from "./FindingsPanel";
import { FlowTable } from "./FlowTable";
import { MetricCard } from "./MetricCard";
import { Sparkline, TimeSeriesChart, type ChartSeries } from "./TimeSeriesChart";

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

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-xs text-ink-2">{children}</span>;
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
  const spark = useMemo(() => run.time_series.map((s) => ({ t: s.time_ms, v: s.mean_queueing_delay_ms })), [run]);

  const flowSeries = (prefix: string): ChartSeries[] =>
    cfg.flows.map((f, i) => ({ key: `${prefix}${f.flow_id}`, label: f.name, color: flowColor(i), dash: flowDash(i) }));

  const p95 = m.p95_queueing_delay_ms;
  const overBudget = p95 !== null && p95 > budget;
  const violationsHigh = m.delay_budget_violation_ratio > 0.05;

  return (
    <section aria-labelledby="results-title" className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="mr-auto">
          <h2 id="results-title" className="text-3xl font-semibold tracking-tight md:text-4xl">
            {run.strategy_label}
          </h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {scenarioLabel && <Chip>{scenarioLabel}</Chip>}
            <Chip>seed {cfg.simulation.seed}</Chip>
            <Chip>{cfg.simulation.duration_ms / 1000} s simulated in {run.runtime_ms} ms</Chip>
            <Chip>
              run <span className="num">{run.run_id}</span>
            </Chip>
            <Chip>simulator v{run.simulator_version}</Chip>
          </div>
        </div>
        {stale && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-full bg-caution/12 px-3 py-1.5 text-xs font-medium text-caution" role="status">
            Settings changed since this run. Run again to update.
          </motion.p>
        )}
      </div>

      <motion.div variants={staggerParent} initial="hidden" animate="show" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          size="lg"
          className="sm:col-span-2 lg:row-span-2"
          label="p95 queueing delay"
          value={<AnimatedNumber value={p95} format={fmtMs} />}
          unit="ms"
          definition="95% of delivered packets waited no longer than this in the queue."
          tone={p95 === null ? "neutral" : overBudget ? "caution" : "positive"}
          toneLabel={p95 === null ? undefined : overBudget ? `over ${budget} ms budget` : `within ${budget} ms budget`}
          detail={`Mean ${fmtMs(m.mean_queueing_delay_ms)} ms, max ${fmtMs(m.max_queueing_delay_ms)} ms over ${fmtInt(m.packets_delivered)} delivered packets. Averages hide tail latency; p95 shows the slowest 5%.`}
        >
          <div className="mt-auto pt-5">
            <Sparkline data={spark} color="var(--color-accent)" budget={budget} />
            <div className="mt-1 flex justify-between text-[11px] text-ink-3">
              <span>Mean queueing delay over the run</span>
              <span>dashed line: {budget} ms budget</span>
            </div>
          </div>
        </MetricCard>
        <MetricCard
          label="Throughput"
          value={<AnimatedNumber value={m.throughput_mbps} format={fmtMbps} />}
          unit="Mbps"
          definition={METRIC_DEFINITIONS[2].definition}
          detail={`${fmtPct(m.link_utilization)} link utilization, offered ${fmtMbps(m.offered_load_mbps)} Mbps`}
        />
        <MetricCard
          label="Packets dropped"
          value={<AnimatedNumber value={m.drop_ratio} format={(v) => fmtPct(v)} />}
          definition={METRIC_DEFINITIONS[4].definition}
          detail={`${fmtInt(m.packets_dropped_overflow)} overflow + ${fmtInt(m.packets_dropped_aqm)} AQM of ${fmtInt(m.packets_generated)} generated`}
        />
        <MetricCard
          label="Over delay budget"
          value={<AnimatedNumber value={m.delay_budget_violation_ratio} format={(v) => fmtPct(v)} />}
          definition={METRIC_DEFINITIONS[5].definition}
          tone={violationsHigh ? "caution" : "positive"}
          toneLabel={violationsHigh ? "above 5%" : "5% or less"}
          detail={`of delivered packets waited longer than ${budget} ms`}
        />
        <MetricCard label="Fairness (Jain's index)" value={fmtJain(m.jain_fairness_index)} definition={METRIC_DEFINITIONS[6].definition} detail={m.fairness_note ?? undefined} />
      </motion.div>

      <Reveal>
        <dl className="panel grid grid-cols-1 divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          {[
            { k: "Mean end-to-end delay", v: `${fmtMs(m.mean_end_to_end_delay_ms)} ms`, d: `p95 ${fmtMs(m.p95_end_to_end_delay_ms)} ms, includes ${cfg.link.propagation_delay_ms} ms propagation`, def: METRIC_DEFINITIONS[1].definition },
            { k: "Queue occupancy", v: `${fmtKB(m.mean_queue_occupancy_bytes)} KB`, d: `mean; peak ${fmtKB(m.peak_queue_occupancy_bytes)} KB of ${cfg.link.queue_capacity_kb} KB`, def: METRIC_DEFINITIONS[7].definition },
            { k: "Packets delivered", v: fmtInt(m.packets_delivered), d: `of ${fmtInt(m.packets_generated)} generated`, def: "Packets that reached the receiver before the run ended." },
            { k: "Left at the end", v: fmtInt(m.packets_queued_at_end + m.packets_in_flight_at_end), d: `${fmtInt(m.packets_queued_at_end)} queued, ${fmtInt(m.packets_in_flight_at_end)} in flight`, def: "The run stops without draining; these are counted separately, never as delivered or dropped." },
          ].map((s) => (
            <div key={s.k} className="px-5 py-4" title={s.def}>
              <dt className="text-xs font-medium text-ink-3">{s.k}</dt>
              <dd className="num mt-1 text-xl font-semibold text-ink">{s.v}</dd>
              <dd className="mt-0.5 text-xs text-ink-3">{s.d}</dd>
            </div>
          ))}
        </dl>
      </Reveal>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Reveal className="xl:col-span-2">
          <TimeSeriesChart
            title="Queueing delay over time"
            description={`Mean wait of packets that started transmission in each ${cfg.simulation.sampling_interval_ms} ms interval.`}
            unit="ms"
            data={data}
            height={280}
            series={multiFlow ? flowSeries("qd_") : [{ key: "delay", label: "Mean queueing delay", color: "var(--color-accent)", area: true }]}
            references={[{ y: budget, label: `budget ${budget} ms` }]}
          />
        </Reveal>
        <Reveal>
          <TimeSeriesChart
            title="End-to-end delay over time"
            description={`Queueing + serialization + ${cfg.link.propagation_delay_ms} ms propagation for packets delivered in each interval.`}
            unit="ms"
            data={data}
            series={[{ key: "e2e", label: "Mean end-to-end delay", color: flowColor(0), area: true }]}
          />
        </Reveal>
        <Reveal delay={0.05}>
          <TimeSeriesChart
            title="Queue occupancy over time"
            description="Bytes waiting in the buffer at each sample."
            unit="KB"
            data={data}
            series={[{ key: "occupancy", label: "Queue occupancy", color: flowColor(0), area: true }]}
            references={[{ y: cfg.link.queue_capacity_kb, label: `capacity ${cfg.link.queue_capacity_kb} KB` }]}
            digits={1}
          />
        </Reveal>
        <Reveal>
          <TimeSeriesChart
            title="Throughput over time"
            description="Delivered bits per sampling interval."
            unit="Mbps"
            data={data}
            series={multiFlow ? [{ key: "throughput", label: "Total", color: TOTAL_COLOR }, ...flowSeries("tp_")] : [{ key: "throughput", label: "Throughput", color: flowColor(0), area: true }]}
            references={[{ y: cfg.link.capacity_mbps, label: `capacity ${cfg.link.capacity_mbps} Mbps` }]}
          />
        </Reveal>
        <Reveal delay={0.05}>
          <TimeSeriesChart
            title="Cumulative drops"
            description="Overflow drops happen when the buffer is full; AQM drops are deliberate early drops."
            unit="packets"
            data={data}
            series={[
              { key: "overflow", label: "Overflow (buffer full)", color: "var(--color-s2)" },
              { key: "aqm", label: "AQM drops", color: "var(--color-s1)", dash: "6 4" },
            ]}
            digits={0}
            stepped
          />
        </Reveal>
        {tcpFlows.length > 0 && (
          <Reveal className="xl:col-span-2">
            <TimeSeriesChart
              title="Congestion window of TCP-like flows"
              description="Packets the sender may have unacknowledged. It halves when the sender learns of a drop."
              unit="packets"
              data={data}
              height={220}
              series={tcpFlows.map(({ f, i }) => ({ key: `cw_${f.flow_id}`, label: f.name, color: flowColor(i), dash: flowDash(i), area: tcpFlows.length === 1 }))}
              digits={1}
            />
          </Reveal>
        )}
      </div>

      <Reveal>
        <FlowTable flows={run.per_flow} budgetMs={budget} capacityMbps={cfg.link.capacity_mbps} />
      </Reveal>

      <FindingsPanel findings={run.findings} />

      <details className="panel group p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between font-semibold tracking-tight text-ink [&::-webkit-details-marker]:hidden">
          Metric definitions
          <ChevronDown size={18} className="text-ink-3 transition-transform duration-300 group-open:rotate-180" aria-hidden="true" />
        </summary>
        <dl className="mt-4 grid grid-cols-1 gap-x-10 gap-y-4 md:grid-cols-2">
          {METRIC_DEFINITIONS.map((d) => (
            <div key={d.term}>
              <dt className="text-sm font-medium text-ink">{d.term}</dt>
              <dd className="mt-0.5 text-sm leading-relaxed text-ink-3">{d.definition}</dd>
            </div>
          ))}
        </dl>
      </details>

      <ExportControls filenameBase={`queuewise-run-${run.run_id}`} json={() => run} csv={() => runToCsv(run)} />
    </section>
  );
}

/** Placeholder with the same shape as the results, shown while the first run computes. */
export function ResultsSkeleton({ label }: { label: string }) {
  return (
    <section className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <p className="sr-only">{label}</p>
      <div className="skeleton h-9 w-72 rounded-full" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="skeleton h-[296px] rounded-2xl sm:col-span-2 lg:row-span-2" />
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-[142px] rounded-2xl" />
        ))}
      </div>
      <div className="skeleton h-[340px] rounded-2xl" />
    </section>
  );
}

