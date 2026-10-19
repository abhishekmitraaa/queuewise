import { useMemo } from "react";
import { motion } from "motion/react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import type { Comparison, Metrics, RunResult } from "../types";
import { comparisonToCsv } from "../lib/exportData";
import { fmtJain, fmtMbps, fmtMs, fmtPct, TRAFFIC_LABELS } from "../lib/format";
import { SERIES_COLORS, SERIES_DASHES, strategyColor, strategyDash } from "../lib/series";
import { AnimatedNumber, Reveal, riseChild, staggerParent } from "../lib/motion";
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

// Columns per run count, chosen so the card grid never leaves an empty cell on wide screens.
const CARD_COLS: Record<number, string> = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-2",
  5: "md:grid-cols-2 xl:grid-cols-3",
  6: "md:grid-cols-2 xl:grid-cols-3",
};

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

function Swatch({ color, dash }: { color: string; dash: string }) {
  return (
    <svg width="22" height="6" aria-hidden="true" className="shrink-0">
      <line x1="0" y1="3" x2="22" y2="3" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={dash || undefined} />
    </svg>
  );
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

  const series = (prefix: string): ChartSeries[] => runs.map((_, i) => ({ key: `${prefix}${i}`, label: labels[i], ...runStyle(runs, i) }));
  const flowIds = [...new Set(runs.flatMap((r) => r.per_flow.map((f) => f.flow_id)))];
  const sameBudget = new Set(runs.map((r) => r.configuration.simulation.delay_budget_ms)).size === 1;
  const sameCapacity = new Set(runs.map((r) => r.configuration.link.capacity_mbps)).size === 1;

  return (
    <section className="flex flex-col gap-10" aria-labelledby="comparison-title">
      <div>
        <h2 id="comparison-title" className="text-3xl font-semibold tracking-tight md:text-4xl">
          {comparison.mode === "controlled" ? "Controlled comparison" : "Run comparison"}
        </h2>
        <p className="mt-2 text-sm text-ink-3">
          {runs.length} runs, comparison <span className="num text-ink-2">{comparison.comparison_id}</span>, simulator v{comparison.simulator_version}
        </p>
      </div>

      {comparison.controlled ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 rounded-2xl border border-positive/40 bg-positive/8 px-5 py-4 text-sm"
        >
          <CircleCheck size={18} className="mt-0.5 shrink-0 text-positive" aria-hidden="true" />
          <div>
            <div className="font-medium text-ink">Only the queue strategy differs</div>
            <div className="text-ink-2">
              Same traffic, seed ({first.simulation.seed}), link, buffer and duration for every run, so differences come from the strategy.
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-caution/40 bg-caution/8 px-5 py-4 text-sm">
          <div className="flex items-start gap-3">
            <TriangleAlert size={18} className="mt-0.5 shrink-0 text-caution" aria-hidden="true" />
            <div>
              <div className="font-medium text-ink">Not a controlled comparison: {comparison.parameter_differences.length} parameter(s) differ</div>
              <div className="text-ink-2">Differences in results cannot be attributed to the queue strategy alone.</div>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead>
                <tr className="text-ink-3">
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Parameter
                  </th>
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
                    <th scope="row" className="num py-1.5 pr-3 font-normal text-ink">
                      {d.parameter}
                    </th>
                    {runs.map((r) => (
                      <td key={r.run_id} className="num px-3 py-1.5 text-ink-2">
                        {formatValue(d.values[r.run_id])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      <motion.div
        variants={staggerParent}
        initial="hidden"
        animate="show"
        className={`grid grid-cols-1 gap-3 ${CARD_COLS[Math.min(runs.length, 6)] ?? "md:grid-cols-2"}`}
      >
        {runs.map((r, i) => {
          const st = runStyle(runs, i);
          const m = r.metrics;
          const budget = r.configuration.simulation.delay_budget_ms;
          const cells: [string, string][] = [
            ["Mean end-to-end", `${fmtMs(m.mean_end_to_end_delay_ms)} ms`],
            ["Throughput", `${fmtMbps(m.throughput_mbps)} Mbps`],
            ["Drop ratio", fmtPct(m.drop_ratio)],
            [`Over ${budget} ms`, fmtPct(m.delay_budget_violation_ratio)],
            ["Jain's index", fmtJain(m.jain_fairness_index)],
          ];
          return (
            <motion.div key={r.run_id} variants={riseChild} className="panel p-5">
              <div className="flex items-center gap-2.5">
                <Swatch {...st} />
                <span className="font-semibold tracking-tight text-ink">{labels[i]}</span>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="num text-4xl font-semibold tracking-tight text-ink">
                  <AnimatedNumber value={m.p95_queueing_delay_ms} format={fmtMs} />
                </span>
                <span className="text-sm text-ink-3">ms p95 queueing delay</span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {cells.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="text-ink-3">{k}</dt>
                    <dd className="num font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </motion.div>
          );
        })}
      </motion.div>

      <Reveal>
        <div className="panel overflow-x-auto p-5">
          <table className="w-full min-w-[620px] text-left text-sm">
            <caption className="mb-4 text-left">
              <span className="block font-semibold tracking-tight text-ink">Side-by-side metrics</span>
              <span className="mt-0.5 block text-xs text-ink-3">
                ★ marks the best measured value in each row: lower delay, drops and violations; higher throughput, utilization and fairness.
              </span>
            </caption>
            <thead>
              <tr>
                <th scope="col" className="pb-3 pr-3 text-xs font-medium text-ink-3">
                  Metric
                </th>
                {runs.map((r, i) => (
                  <th key={r.run_id} scope="col" className="px-3 pb-3 text-right">
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                      <Swatch {...runStyle(runs, i)} />
                      {labels[i]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ROWS.map((row) => (
                <tr key={row.key} className="transition-colors hover:bg-raised/60">
                  <th scope="row" className="py-2.5 pr-3 font-normal text-ink-2">
                    {row.label}
                    {row.unit && <span className="text-ink-3"> ({row.unit})</span>}
                  </th>
                  {runs.map((r) => {
                    const best = comparison.best[row.key as string]?.includes(r.run_id) && runs.length > 1;
                    return (
                      <td key={r.run_id} className={`num px-3 py-2.5 text-right ${best ? "font-semibold text-ink" : "text-ink-2"}`}>
                        {best && (
                          <span className="mr-1 text-accent" aria-label="best">
                            ★
                          </span>
                        )}
                        {row.fmt(r.metrics[row.key] as number | null)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Reveal className="xl:col-span-2">
          <TimeSeriesChart
            title="Queueing delay over time"
            description="Mean wait per sampling interval, each strategy on the same workload."
            unit="ms"
            height={280}
            data={data}
            series={series("d")}
            references={sameBudget ? [{ y: first.simulation.delay_budget_ms, label: `budget ${first.simulation.delay_budget_ms} ms` }] : []}
          />
        </Reveal>
        <Reveal>
          <TimeSeriesChart title="Queue occupancy over time" unit="KB" data={data} series={series("o")} digits={1} />
        </Reveal>
        <Reveal delay={0.05}>
          <TimeSeriesChart
            title="Throughput over time"
            unit="Mbps"
            data={data}
            series={series("t")}
            references={sameCapacity ? [{ y: first.link.capacity_mbps, label: `capacity ${first.link.capacity_mbps} Mbps` }] : []}
          />
        </Reveal>
        <Reveal className="xl:col-span-2">
          <TimeSeriesChart title="Cumulative drops (overflow + AQM)" unit="packets" height={220} data={data} series={series("x")} digits={0} stepped />
        </Reveal>
      </div>

      <Reveal>
        <div className="panel overflow-x-auto p-5">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="mb-4 text-left">
              <span className="block font-semibold tracking-tight text-ink">Per-flow outcomes by strategy</span>
              <span className="mt-0.5 block text-xs text-ink-3">Throughput, p95 queueing delay and loss for each flow.</span>
            </caption>
            <thead>
              <tr className="text-xs text-ink-3">
                <th scope="col" className="pb-3 pr-3 font-medium">
                  Flow
                </th>
                {runs.map((r, i) => (
                  <th key={r.run_id} scope="col" className="px-3 pb-3 text-right font-medium">
                    {labels[i]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {flowIds.map((fid) => {
                const ref = runs.map((r) => r.per_flow.find((f) => f.flow_id === fid)).find(Boolean)!;
                return (
                  <tr key={fid}>
                    <th scope="row" className="py-3 pr-3 font-normal">
                      <div className="font-medium text-ink">{ref.name}</div>
                      <div className="text-xs text-ink-3">{TRAFFIC_LABELS[ref.traffic_type]}</div>
                    </th>
                    {runs.map((r) => {
                      const f = r.per_flow.find((p) => p.flow_id === fid);
                      return (
                        <td key={r.run_id} className="px-3 py-3 text-right">
                          {f ? (
                            <>
                              <div className="num text-ink">{fmtMbps(f.throughput_mbps)} Mbps</div>
                              <div className="num text-xs text-ink-3">
                                p95 {fmtMs(f.p95_queueing_delay_ms)} ms, loss {fmtPct(f.loss_ratio)}
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
      </Reveal>

      <FindingsPanel
        findings={comparison.findings}
        title="What the comparison shows"
        intro="Statements are generated from the measured differences between these runs; none assumes a winner in advance."
      />

      <Reveal>
        <section aria-labelledby="cmp-config-title">
          <h3 id="cmp-config-title" className="text-xl font-semibold tracking-tight text-ink">
            Configuration and seeds
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {runs.map((r, i) => {
              const c = r.configuration;
              return (
                <div key={r.run_id} className="panel p-4 text-xs leading-relaxed text-ink-2">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                    <Swatch {...runStyle(runs, i)} />
                    {labels[i]}
                  </div>
                  <div>
                    run <span className="num">{r.run_id}</span>, seed {c.simulation.seed}
                  </div>
                  <div>
                    Link {c.link.capacity_mbps} Mbps, {c.link.propagation_delay_ms} ms, buffer {c.link.queue_capacity_kb} KB
                  </div>
                  <div>
                    {c.simulation.duration_ms} ms run, {c.simulation.sampling_interval_ms} ms samples, budget {c.simulation.delay_budget_ms} ms
                  </div>
                  <div>
                    AQM target {c.aqm.target_ms} ms, interval {c.aqm.interval_ms} ms, quantum {c.aqm.quantum_bytes} B
                  </div>
                  <ul className="mt-2 space-y-0.5">
                    {c.flows.map((f) => (
                      <li key={f.flow_id}>
                        {f.name}: {TRAFFIC_LABELS[f.traffic_type].toLowerCase()}, {f.offered_rate_mbps} Mbps, {f.packet_size_bytes} B, {f.start_ms}-{f.stop_ms} ms
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      </Reveal>

      <ExportControls
        filenameBase={`queuewise-comparison-${comparison.comparison_id}`}
        json={() => comparison}
        csv={() => comparisonToCsv(comparison)}
        label="Export this comparison"
      />
    </section>
  );
}
