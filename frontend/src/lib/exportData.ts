// Exports are built in the browser from the results the API already returned,
// so they work the same locally and on a stateless serverless host. The CSV
// layout matches the backend's /export endpoints (backend/app/simulation/service.py).
import type { Comparison, RunResult } from "../types";

const BASE_COLUMNS = [
  "time_ms",
  "queue_occupancy_bytes",
  "queue_occupancy_packets",
  "mean_queueing_delay_ms",
  "max_queueing_delay_ms",
  "mean_end_to_end_delay_ms",
  "throughput_mbps",
  "cumulative_drops",
  "cumulative_overflow_drops",
  "cumulative_aqm_drops",
] as const;

type Cell = string | number | null | undefined;

function seriesRows(run: RunResult): { header: string[]; rows: Cell[][] } {
  const flows = run.configuration.flows;
  const flowIds = flows.map((f) => f.flow_id);
  const cwndIds = flows.filter((f) => f.traffic_type === "tcp_like").map((f) => f.flow_id);
  const header = [
    ...BASE_COLUMNS,
    ...flowIds.map((id) => `throughput_mbps__${id}`),
    ...flowIds.map((id) => `queueing_delay_ms__${id}`),
    ...cwndIds.map((id) => `cwnd_packets__${id}`),
  ];
  const rows = run.time_series.map((s) => [
    ...BASE_COLUMNS.map((c) => s[c]),
    ...flowIds.map((id) => s.per_flow_throughput_mbps[id]),
    ...flowIds.map((id) => s.per_flow_queueing_delay_ms[id]),
    ...cwndIds.map((id) => s.per_flow_cwnd_packets?.[id]),
  ]);
  return { header, rows };
}

function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(lines: Cell[][]): string {
  return lines.map((l) => l.map(csvCell).join(",")).join("\n") + "\n";
}

export function runToCsv(run: RunResult): string {
  const { header, rows } = seriesRows(run);
  return toCsv([["run_id", "strategy", ...header], ...rows.map((r) => [run.run_id, run.strategy, ...r])]);
}

export function comparisonToCsv(comparison: Comparison): string {
  const parts = comparison.runs.map((run) => ({ run, ...seriesRows(run) }));
  const columns: string[] = [];
  parts.forEach((p) => p.header.forEach((c) => columns.includes(c) || columns.push(c)));
  const lines: Cell[][] = [["run_id", "strategy", ...columns]];
  parts.forEach(({ run, header, rows }) => {
    rows.forEach((row) => {
      const byCol = new Map(header.map((c, i) => [c, row[i]]));
      lines.push([run.run_id, run.strategy, ...columns.map((c) => byCol.get(c))]);
    });
  });
  return toCsv(lines);
}

export function downloadText(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
